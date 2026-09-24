"""Yalnızca loopback üzerinde çalışan, tek aktif kameralı yerel API."""
from __future__ import annotations

import argparse
import asyncio
from contextlib import asynccontextmanager, suppress
from pathlib import Path
import re
import tempfile
import time
import anyio

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from starlette.concurrency import run_in_threadpool
from starlette.middleware.trustedhost import TrustedHostMiddleware

from live_analysis import LiveSession, Models

MAX_UPLOAD = 512 * 1024 * 1024
SESSION_TTL = 180
ORIGINS = {f"http://{host}:{port}" for host in ("localhost", "127.0.0.1") for port in (5173, 4173)}
SESSION_ID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")


class StepRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    time_s: float = Field(ge=0, le=604800)
    generation: int = Field(ge=0, le=2_147_483_647, strict=True)


def create_app(model_factory=Models, session_factory=LiveSession):
    state = {"models": None, "error": None, "session": None, "id": None,
             "temp": None, "touched": 0.0}
    lock = asyncio.Lock()

    async def close_session():
        if state["session"] is not None:
            await run_in_threadpool(state["session"].close)
        if state["temp"] is not None:
            state["temp"].cleanup()
        state.update(session=None, id=None, temp=None, touched=0.0)

    async def reap():
        while True:
            await asyncio.sleep(30)
            async with lock:
                if state["id"] and time.monotonic() - state["touched"] > SESSION_TTL:
                    await close_session()

    @asynccontextmanager
    async def lifespan(app):
        try:
            state["models"] = await run_in_threadpool(model_factory)
        except Exception as exc:
            state["error"] = f"Modeller yüklenemedi: {exc}"
        reaper = asyncio.create_task(reap())
        try:
            yield
        finally:
            reaper.cancel()
            with suppress(asyncio.CancelledError):
                await reaper
            async with lock:
                await close_session()

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "testserver"])

    @app.middleware("http")
    async def local_only(request: Request, call_next):
        origin = request.headers.get("origin")
        if origin is not None and origin not in ORIGINS:
            return JSONResponse({"detail": "Yalnızca yerel kamera paneli kullanılabilir."}, status_code=403)
        if request.method != "GET" and request.headers.get("x-teklas-client") != "camera-wall":
            return JSONResponse({"detail": "Panel başlığı eksik."}, status_code=403)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/api/health")
    def health():
        return {"ready": state["models"] is not None, "error": state["error"],
                "active_sessions": int(state["id"] is not None), "max_sessions": 1,
                "device": str(getattr(state["models"], "device", "unknown")),
                "ucf_mode": "experimental_causal_8s", "max_upload_bytes": MAX_UPLOAD}

    def check_id(session_id):
        if not SESSION_ID.fullmatch(session_id):
            raise HTTPException(422, "Geçersiz oturum kimliği.")

    def require_session(session_id):
        check_id(session_id)
        if state["id"] != session_id or state["session"] is None:
            raise HTTPException(404, "Analiz oturumu yok veya süresi doldu; yeniden başlatın.")
        state["touched"] = time.monotonic()
        return state["session"]

    @app.put("/api/sessions/{session_id}")
    async def upload(session_id: str, request: Request):
        check_id(session_id)
        if state["models"] is None:
            raise HTTPException(503, state["error"] or "Modeller hazır değil.")
        suffix = request.headers.get("x-video-extension", "").lower()
        if suffix not in {".mp4", ".webm", ".mov", ".m4v", ".ogv"}:
            raise HTTPException(415, "MP4, WebM, MOV, M4V veya OGV seçin.")
        try:
            length = int(request.headers.get("content-length", "0"))
        except ValueError:
            raise HTTPException(400, "Geçersiz dosya boyutu.")
        if length > MAX_UPLOAD:
            raise HTTPException(413, "En fazla 512 MiB video seçin.")
        async with lock:
            if state["id"] is not None:
                raise HTTPException(409, "Tek kamera sınırı: açık analizi önce durdurun.")
            temp = tempfile.TemporaryDirectory(prefix="teklas-camera-")
            state.update(id=session_id, temp=temp, touched=time.monotonic())
            path = Path(temp.name) / f"video{suffix}"
            try:
                size = 0
                with anyio.fail_after(180):
                    with path.open("xb") as output:
                        async for chunk in request.stream():
                            size += len(chunk)
                            if size > MAX_UPLOAD:
                                raise HTTPException(413, "En fazla 512 MiB video seçin.")
                            output.write(chunk)
                if size == 0:
                    raise HTTPException(400, "Video dosyası boş.")
                session = await run_in_threadpool(session_factory, path, state["models"])
                state.update(session=session, touched=time.monotonic())
                return {"session_id": session_id, "meta": session.meta}
            except BaseException as exc:
                await close_session()
                if isinstance(exc, HTTPException):
                    raise
                if isinstance(exc, (ValueError, OSError, TimeoutError)):
                    raise HTTPException(422, f"Video hazırlanamadı: {exc}") from exc
                raise

    @app.get("/api/sessions/{session_id}")
    async def heartbeat(session_id: str):
        async with lock:
            require_session(session_id)
        return {"active": True}

    @app.post("/api/sessions/{session_id}/step")
    async def step(session_id: str, body: StepRequest):
        async with lock:
            session = require_session(session_id)
            try:
                result = await run_in_threadpool(session.step, body.time_s, body.generation)
                state["touched"] = time.monotonic()
                return result
            except Exception as exc:
                await close_session()
                raise HTTPException(422, f"Analiz durduruldu: {exc}") from exc

    @app.delete("/api/sessions/{session_id}")
    async def stop(session_id: str):
        check_id(session_id)
        async with lock:
            if state["id"] == session_id:
                await close_session()
        return {"stopped": True}

    return app


def main():
    import uvicorn
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--device", choices=["auto", "cpu", "cuda", "mps"], default="auto")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    app = create_app(model_factory=lambda: Models(args.device))
    uvicorn.run(app, host="127.0.0.1", port=args.port, workers=1)


if __name__ == "__main__":
    main()

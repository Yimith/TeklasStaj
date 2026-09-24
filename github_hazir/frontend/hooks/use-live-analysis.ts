'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LocalSource } from './use-video-wall';
import type { LiveResult } from '@/lib/live-analysis';

type Health = {
  ready: boolean;
  error: string | null;
  device: string;
  active_sessions: number;
};
type Target = { cameraId: string; url: string; sessionId: string; file: File };
export type AnalysisState = {
  cameraId: string | null;
  phase: 'idle' | 'uploading' | 'ready' | 'error';
  message: string;
  result: LiveResult | null;
  mediaTime: number;
  paused: boolean;
};
const HEADERS = { 'X-Teklas-Client': 'camera-wall' };

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as {
      detail?: unknown;
    } | null;
    throw new Error(
      typeof error?.detail === 'string'
        ? error.detail
        : `Yerel servis hatası (${response.status}).`,
    );
  }
  return response.json() as Promise<T>;
}

export function useLiveAnalysis({
  sources,
  getVideo,
  revision,
}: {
  sources: Record<string, LocalSource>;
  getVideo: (id: string) => HTMLVideoElement | undefined;
  revision: number;
}) {
  const [health, setHealth] = useState<Health | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [state, setState] = useState<AnalysisState>({
    cameraId: null,
    phase: 'idle',
    message: '',
    result: null,
    mediaTime: 0,
    paused: true,
  });
  const generation = useRef(0);
  const currentTarget = useRef(target);
  currentTarget.current = target;
  const cleanupRequest = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    let active = true;
    const abort = new AbortController();
    const check = async () => {
      try {
        const value = await api<Health>('/api/health', {
          signal: AbortSignal.any([abort.signal, AbortSignal.timeout(4000)]),
        });
        if (active) setHealth(value);
      } catch {
        if (active) setHealth(null);
      }
    };
    void check();
    const timer = setInterval(() => void check(), 10000);
    return () => {
      active = false;
      abort.abort();
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    generation.current++;
    setState((s) => ({ ...s, result: null }));
  }, [revision]);

  const currentSource = target ? sources[target.cameraId] : undefined;
  useEffect(() => {
    if (target && (currentSource?.url !== target.url || currentSource.error))
      setTarget(null);
  }, [target, currentSource]);

  useEffect(() => {
    if (!target) {
      setState({
        cameraId: null,
        phase: 'idle',
        message: '',
        result: null,
        mediaTime: 0,
        paused: true,
      });
      return;
    }
    let active = true,
      ready = false,
      failed = false,
      busy = false;
    let lastSent = -1,
      lastObserved = -1,
      observedAt = performance.now();
    let lastGeneration = -1;
    const abort = new AbortController();
    const endpoint = `/api/sessions/${target.sessionId}`;
    const live = () =>
      active && currentTarget.current?.sessionId === target.sessionId;
    generation.current++;
    setState({
      cameraId: target.cameraId,
      phase: 'uploading',
      message: 'Video yerel servise aktarılıyor…',
      result: null,
      mediaTime: 0,
      paused: true,
    });
    const fail = (error: unknown) => {
      if (!live()) return;
      failed = true;
      setState((s) => ({
        ...s,
        phase: 'error',
        result: null,
        message:
          error instanceof Error ? error.message : 'Analiz bağlantısı kesildi.',
      }));
    };
    void (async () => {
      try {
        await cleanupRequest.current;
        if (!live()) return;
        await api(endpoint, {
          method: 'PUT',
          signal: AbortSignal.any([abort.signal, AbortSignal.timeout(190000)]),
          headers: {
            ...HEADERS,
            'Content-Type': 'application/octet-stream',
            'X-Video-Extension': `.${target.file.name.split('.').pop()?.toLowerCase()}`,
          },
          body: target.file,
        });
        if (!live()) return;
        ready = true;
        setState((s) => ({
          ...s,
          phase: 'ready',
          message: 'Hazır. Oynat düğmesiyle görüntü geldikçe analiz başlar.',
        }));
      } catch (error) {
        fail(error);
      }
    })();

    const tick = async () => {
      if (!live()) return;
      const video = getVideo(target.cameraId);
      if (!video || video.readyState < 2) return;
      const now = video.currentTime;
      const clock = performance.now();
      const expected = ((clock - observedAt) / 1000) * video.playbackRate;
      if (
        lastObserved >= 0 &&
        (now < lastObserved - 0.1 || now - lastObserved > expected + 0.7)
      ) {
        generation.current++;
        setState((s) => ({ ...s, result: null }));
      }
      observedAt = clock;
      lastObserved = now;
      setState((s) =>
        s.mediaTime === now && s.paused === video.paused
          ? s
          : { ...s, mediaTime: now, paused: video.paused },
      );
      if (
        !ready ||
        failed ||
        busy ||
        video.paused ||
        video.seeking ||
        video.ended
      )
        return;
      const version = generation.current;
      if (version === lastGeneration && now - lastSent < 0.18) return;
      lastSent = now;
      lastGeneration = version;
      busy = true;
      try {
        const result = await api<LiveResult>(`${endpoint}/step`, {
          method: 'POST',
          headers: { ...HEADERS, 'Content-Type': 'application/json' },
          signal: AbortSignal.any([abort.signal, AbortSignal.timeout(30000)]),
          body: JSON.stringify({ time_s: now, generation: version }),
        });
        if (live() && version === generation.current)
          setState((s) => ({ ...s, result, message: '' }));
      } catch (error) {
        fail(error);
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(() => void tick(), 120);
    const heartbeat = setInterval(() => {
      if (ready && !failed && !busy)
        void api(endpoint, {
          signal: AbortSignal.any([abort.signal, AbortSignal.timeout(5000)]),
        }).catch(fail);
    }, 30000);
    const remove = () =>
      fetch(endpoint, {
        method: 'DELETE',
        headers: HEADERS,
        keepalive: true,
      }).catch(() => undefined);
    const onPageHide = () => {
      void remove();
    };
    window.addEventListener('pagehide', onPageHide);
    return () => {
      active = false;
      abort.abort();
      clearInterval(timer);
      clearInterval(heartbeat);
      window.removeEventListener('pagehide', onPageHide);
      cleanupRequest.current = remove();
    };
  }, [target, getVideo]);

  const start = useCallback(
    (cameraId: string) => {
      const source = sources[cameraId];
      if (!source || source.error || !source.duration)
        return 'Önce oynatılabilir bir video seç.';
      if (source.size > 512 * 1024 * 1024) {
        return 'En fazla 512 MiB video seçin.';
      }
      setTarget({
        cameraId,
        url: source.url,
        sessionId: crypto.randomUUID(),
        file: source.file,
      });
      return null;
    },
    [sources],
  );

  return { health, state, start, stop: () => setTarget(null) };
}

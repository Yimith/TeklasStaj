'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CAMERAS, isVideoFile, type CameraConfig } from '@/lib/cameras';
import { PlaybackController } from '@/lib/playback';

export type LocalSource = {
  file: File;
  url: string;
  name: string;
  size: number;
  duration?: number;
  error?: string;
};

export function useVideoWall() {
  const [cameras, setCameras] = useState<CameraConfig[]>(() =>
    CAMERAS.map((c) => ({ ...c })),
  );
  const [sources, setSources] = useState<Record<string, LocalSource>>({});
  const [notice, setNotice] = useState('');
  const urls = useRef(new Map<string, string>());
  const videos = useRef(new Map<string, HTMLVideoElement>());
  const [revision, setRevision] = useState(0);
  const [controller] = useState(
    () =>
      new PlaybackController(undefined, (id, error) => {
        setSources((previous) =>
          previous[id]
            ? { ...previous, [id]: { ...previous[id], error } }
            : previous,
        );
      }),
  );
  const [playback, setPlayback] = useState(controller.snapshot());

  useEffect(() => {
    const timer = setInterval(() => {
      const next = controller.tick();
      setPlayback((previous) =>
        previous.time === next.time &&
        previous.duration === next.duration &&
        previous.running === next.running &&
        previous.rate === next.rate &&
        previous.loop === next.loop
          ? previous
          : next,
      );
    }, 150);
    const activeUrls = urls.current;
    return () => {
      clearInterval(timer);
      controller.destroy();
      activeUrls.forEach((url) => URL.revokeObjectURL(url));
      activeUrls.clear();
    };
  }, [controller]);

  const pause = useCallback(() => {
    controller.pause();
    setPlayback(controller.snapshot());
  }, [controller]);
  const reset = useCallback(() => {
    setRevision((v) => v + 1);
    controller.pause();
    controller.seek(0);
    setPlayback(controller.snapshot());
  }, [controller]);
  const register = useCallback(
    (id: string, video: HTMLVideoElement | null) => {
      if (video) videos.current.set(id, video);
      else videos.current.delete(id);
      controller.attach(id, video);
    },
    [controller],
  );

  const addFiles = useCallback(
    (files: File[], targetId?: string) => {
      const valid = files.filter(isVideoFile);
      if (!valid.length) {
        setNotice(
          'Geçerli ve boş olmayan bir video seçin. MP4 (H.264) veya WebM önerilir.',
        );
        return;
      }
      reset();
      const targets = targetId
        ? [targetId]
        : CAMERAS.map((c) => c.id).sort(
            (a, b) => Number(urls.current.has(a)) - Number(urls.current.has(b)),
          );
      const additions: Record<string, LocalSource> = {};
      valid.slice(0, targets.length).forEach((file, index) => {
        const id = targets[index];
        const old = urls.current.get(id);
        controller.attach(id, null);
        if (old) URL.revokeObjectURL(old);
        const url = URL.createObjectURL(file);
        urls.current.set(id, url);
        additions[id] = { url, name: file.name, size: file.size, file };
      });
      setSources((previous) => ({ ...previous, ...additions }));
      const count = Object.keys(additions).length;
      const skipped = files.length - count;
      setNotice(
        `${count} video seçildi. Analizi başlatırsan seçilen video yalnızca bu bilgisayardaki servise aktarılır.${skipped ? ` ${skipped} dosya sınır veya biçim nedeniyle eklenmedi.` : ''}`,
      );
    },
    [controller, reset],
  );

  const removeSource = useCallback(
    (id: string) => {
      reset();
      controller.attach(id, null);
      const url = urls.current.get(id);
      if (url) URL.revokeObjectURL(url);
      urls.current.delete(id);
      setSources((previous) => {
        const next = { ...previous };
        delete next[id];
        return next;
      });
      setNotice(
        `${id} videosu panelden kaldırıldı. Bilgisayarındaki dosya silinmedi.`,
      );
    },
    [controller, reset],
  );

  const onMetadata = useCallback(
    (id: string, url: string, duration: number) => {
      if (urls.current.get(id) !== url) return;
      if (!Number.isFinite(duration) || duration <= 0) {
        controller.fail(id, 'Video süresi okunamadı. Başka bir video seçin.');
        return;
      }
      setSources((previous) =>
        previous[id]?.url === url
          ? {
              ...previous,
              [id]: { ...previous[id], duration, error: undefined },
            }
          : previous,
      );
      controller.sync(true);
      setPlayback(controller.snapshot());
    },
    [controller],
  );

  const onVideoError = useCallback(
    (id: string, url: string) => {
      if (urls.current.get(id) === url)
        controller.fail(
          id,
          'Video açılamadı. MP4 (H.264) veya WebM biçiminde başka bir dosya seçin.',
        );
    },
    [controller],
  );

  const play = useCallback(() => {
    if (!controller.play())
      setNotice('Oynatmak için önce bir video seçin ve yüklenmesini bekleyin.');
    setPlayback(controller.snapshot());
  }, [controller]);

  const getVideo = useCallback((id: string) => videos.current.get(id), []);

  return {
    cameras,
    sources,
    playback,
    notice,
    revision,
    getVideo,
    setNotice,
    register,
    addFiles,
    removeSource,
    onMetadata,
    onVideoError,
    play,
    pause,
    reset,
    seek: (time: number) => {
      setRevision((v) => v + 1);
      controller.seek(time);
      setPlayback(controller.snapshot());
    },
    setLoop: (loop: boolean) => {
      controller.setLoop(loop);
      setPlayback(controller.snapshot());
    },
    setRate: (rate: number) => {
      controller.setRate(rate);
      setPlayback(controller.snapshot());
    },
    updateCamera: (
      id: string,
      changes: Partial<Pick<CameraConfig, 'name' | 'mode'>>,
    ) =>
      setCameras((previous) =>
        previous.map((c) => (c.id === id ? { ...c, ...changes } : c)),
      ),
  };
}

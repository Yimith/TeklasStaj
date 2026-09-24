'use client';

import { useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import type { CameraConfig } from '@/lib/cameras';
import type { LocalSource } from '@/hooks/use-video-wall';

type Wall = {
  cameras: CameraConfig[];
  sources: Record<string, LocalSource>;
  playback: { running: boolean; time: number; duration: number };
  focused: string | null;
  modelConnected: boolean;
  analysisCamera: string | null;
  analysisPhase: string;
  play: () => void;
  pause: () => void;
  reset: () => void;
  focus: (id: string | null) => void;
};
type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => unknown;
};
type ToolDocument = Document & {
  modelContext?: {
    registerTool: (
      tool: Tool,
      options: { signal: AbortSignal },
    ) => void | Promise<void>;
  };
};

export function useWallTools(wall: Wall) {
  const latest = useRef(wall);
  useEffect(() => {
    latest.current = wall;
  });
  useEffect(() => {
    const context = (document as ToolDocument).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const snapshot = () => ({
      modelConnected: latest.current.modelConnected,
      analysisCamera: latest.current.analysisCamera,
      analysisPhase: latest.current.analysisPhase,
      focused: latest.current.focused,
      playback: latest.current.playback,
      cameras: latest.current.cameras.map((c) => ({
        id: c.id,
        name: c.name,
        mode: c.mode,
        source: latest.current.sources[c.id] ? 'local-video' : 'no-video',
        error: latest.current.sources[c.id]?.error ?? null,
      })),
    });
    const tools: Tool[] = [
      {
        name: 'get_camera_wall',
        title: 'Kamera durumunu oku',
        description:
          'Read local playback and model-connection state. Does not return file paths or video content.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: () => snapshot(),
      },
      {
        name: 'control_camera_wall',
        title: 'Video oynatmayı kontrol et',
        description:
          'Play, pause or reset selected local videos. When the user has enabled analysis, playback also drives local inference. Does not select or upload new files.',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['play', 'pause', 'reset'] },
          },
          required: ['action'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        execute(input) {
          if (
            !input ||
            typeof input !== 'object' ||
            Object.keys(input).length !== 1 ||
            !('action' in input) ||
            !['play', 'pause', 'reset'].includes(String(input.action))
          )
            throw new Error('Geçersiz oynatma eylemi.');
          if (
            input.action === 'play' &&
            !Object.values(latest.current.sources).some(
              (s) => s.duration && !s.error,
            )
          )
            throw new Error('Önce oynatılabilir bir video seçin.');
          flushSync(() =>
            latest.current[input.action as 'play' | 'pause' | 'reset'](),
          );
          return snapshot();
        },
      },
      {
        name: 'focus_camera',
        title: 'Kamerayı büyüt',
        description:
          'Enlarge an existing camera. Pass null to return to the six-camera wall. Does not start analysis.',
        inputSchema: {
          type: 'object',
          properties: { cameraId: { type: ['string', 'null'] } },
          required: ['cameraId'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        execute(input) {
          if (
            !input ||
            typeof input !== 'object' ||
            Object.keys(input).length !== 1 ||
            !('cameraId' in input) ||
            (input.cameraId !== null &&
              !latest.current.cameras.some((c) => c.id === input.cameraId))
          )
            throw new Error('Geçersiz kamera kimliği.');
          flushSync(() =>
            latest.current.focus(input.cameraId as string | null),
          );
          return snapshot();
        },
      },
    ];
    for (const tool of tools) {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {
      }
    }
    return () => lifecycle.abort();
  }, []);
}

import { eventPresentation } from './cameras.ts';

export type Detection = {
  class_name: 'person' | 'forklift' | 'forklift_tipped';
  score: number;
  track_id: number | null;
  xyxyn: [number, number, number, number];
};
export type LiveResult = {
  generation: number;
  frame_time_s: number;
  width: number;
  height: number;
  detections: Detection[];
  ucf: {
    class_name: 'Normal' | 'Fighting' | 'Assault' | 'Arson';
    scores: Record<string, number>;
    window_start_s: number;
    window_end_s: number;
    clip_count: number;
    experimental: true;
  } | null;
  context_seconds: number;
  min_context_seconds: number;
  reset_reason: string;
  processing_ms: number;
};

export function freshAt(at: number, now: number, maxAge: number): boolean {
  return (
    Number.isFinite(at) &&
    Number.isFinite(now) &&
    now >= at - 0.1 &&
    now - at <= maxAge
  );
}
export function liveView(result: LiveResult | null, now: number) {
  const detections =
    result && freshAt(result.frame_time_s, now, 0.8) ? result.detections : [];
  const ucf =
    result?.ucf && freshAt(result.ucf.window_end_s, now, 2) ? result.ucf : null;
  const tipped = detections.some((box) => box.class_name === 'forklift_tipped');
  return {
    detections,
    ucf,
    tipped,
    presentation: tipped
      ? eventPresentation('forklift_tipped')
      : ucf
        ? eventPresentation(ucf.class_name)
        : { label: 'UCF sonucu bekleniyor', tone: 'idle' },
    lag: result ? Math.max(0, now - result.frame_time_s) : 0,
  };
}

export type AnalysisMode = 'both';
export type EventClass =
  | 'Normal'
  | 'Fighting'
  | 'Assault'
  | 'Arson'
  | 'forklift_tipped';
export type CameraConfig = {
  id: string;
  name: string;
  scene: number;
  demoClass: EventClass;
  mode: AnalysisMode;
};
export const CAMERAS: CameraConfig[] = [
  {
    id: 'CAM 01',
    name: 'Üretim hattı',
    scene: 0,
    demoClass: 'Normal',
    mode: 'both',
  },
  { id: 'CAM 02', name: 'Depo', scene: 1, demoClass: 'Normal', mode: 'both' },
  {
    id: 'CAM 03',
    name: 'Yükleme alanı',
    scene: 2,
    demoClass: 'Arson',
    mode: 'both',
  },
  {
    id: 'CAM 04',
    name: 'Sevkiyat',
    scene: 3,
    demoClass: 'Normal',
    mode: 'both',
  },
  {
    id: 'CAM 05',
    name: 'Yan koridor',
    scene: 4,
    demoClass: 'Fighting',
    mode: 'both',
  },
  {
    id: 'CAM 06',
    name: 'Dış saha',
    scene: 5,
    demoClass: 'forklift_tipped',
    mode: 'both',
  },
];
export function eventPresentation(value: string): {
  label: string;
  tone: string;
} {
  switch (value) {
    case 'Normal':
      return { label: 'Normal', tone: 'normal' };
    case 'Arson':
      return { label: 'Yangın ve patlama tehlikesi (Arson)', tone: 'warning' };
    case 'Fighting':
      return { label: 'Olası şiddet olayı (Fighting)', tone: 'danger' };
    case 'Assault':
      return { label: 'Olası şiddet olayı (Assault)', tone: 'danger' };
    case 'forklift_tipped':
      return { label: 'Devrilmiş forklift', tone: 'danger' };
    default:
      return { label: 'Sonuç yok', tone: 'idle' };
  }
}
export function formatTime(value: number): string {
  const seconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  const tail = `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  return hours ? `${hours}:${tail}` : tail;
}
export function isVideoFile(file: {
  name: string;
  type: string;
  size: number;
}): boolean {
  return (
    file.size > 0 &&
    (/^video\//i.test(file.type) ||
      /\.(mp4|webm|mov|m4v|ogv)$/i.test(file.name))
  );
}
export function playbackTarget(
  time: number,
  duration: number,
  loop: boolean,
): number {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(time))
    return 0;
  return loop
    ? Math.max(0, time) % duration
    : Math.min(Math.max(0, time), duration);
}
export function cameraResult(
  camera: CameraConfig,
  source: { error?: string } | undefined,
  demo: boolean,
) {
  if (source)
    return {
      label: source.error ? 'Video açılamadı' : 'Analiz bağlı değil',
      tone: source.error ? 'danger' : 'idle',
    };
  if (!demo) return { label: 'Video bekleniyor', tone: 'idle' };
  return eventPresentation(camera.demoClass);
}

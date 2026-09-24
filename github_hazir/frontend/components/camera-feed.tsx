'use client';
/* oxlint-disable next/no-img-element */

import { useCallback, useRef, type CSSProperties } from 'react';
import {
  Expand,
  FileVideo,
  FolderOpen,
  LoaderCircle,
  Minimize,
  Settings2,
  VideoOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  cameraResult,
  formatTime,
  playbackTarget,
  type CameraConfig,
} from '@/lib/cameras';
export { cameraResult } from '@/lib/cameras';
import type { LocalSource } from '@/hooks/use-video-wall';
import type { AnalysisState } from '@/hooks/use-live-analysis';
import { liveView } from '@/lib/live-analysis';

const BOXES: Record<
  number,
  { label: string; kind: string; x: number; y: number; w: number; h: number }[]
> = {
  0: [
    { label: 'person', kind: 'person', x: 32, y: 56, w: 11, h: 32 },
    { label: 'person', kind: 'person', x: 39, y: 22, w: 9, h: 27 },
  ],
  1: [
    { label: 'forklift', kind: 'forklift', x: 40, y: 25, w: 23, h: 41 },
    { label: 'person', kind: 'person', x: 61, y: 35, w: 8, h: 26 },
  ],
  3: [
    { label: 'forklift', kind: 'forklift', x: 30, y: 15, w: 25, h: 44 },
    { label: 'person', kind: 'person', x: 64, y: 36, w: 9, h: 27 },
  ],
  5: [{ label: 'forklift_tipped', kind: 'tipped', x: 28, y: 28, w: 50, h: 30 }],
};

export function DemoScene({
  camera,
  boxes = false,
  className = '',
}: {
  camera: CameraConfig;
  boxes?: boolean;
  className?: string;
}) {
  return (
    <div className={`demo-scene ${className}`}>
      <img
        width={1774}
        height={887}
        src="/camera-demo.png"
        className="demo-sprite"
        alt={`${camera.name}: yapay zekâ ile oluşturulmuş statik örnek kamera görüntüsü`}
        style={{
          left: `${(camera.scene % 3) * -100}%`,
          top: camera.scene < 3 ? '0' : '-100%',
        }}
      />
      {boxes &&
        BOXES[camera.scene]?.map((box, i) => (
          <span
            key={i}
            className={`detection-box box-${box.kind}`}
            style={
              {
                left: `${box.x}%`,
                top: `${box.y}%`,
                width: `${box.w}%`,
                height: `${box.h}%`,
              } as CSSProperties
            }
          >
            <span>{box.label}</span>
          </span>
        ))}
    </div>
  );
}

type Props = {
  camera: CameraConfig;
  source?: LocalSource;
  demo: boolean;
  boxes: boolean;
  focused: boolean;
  time: number;
  loop: boolean;
  running: boolean;
  register: (id: string, video: HTMLVideoElement | null) => void;
  onMetadata: (id: string, url: string, duration: number) => void;
  onVideoError: (id: string, url: string) => void;
  onFile: (files: File[], id?: string) => void;
  onFocus: (id: string) => void;
  onSettings: (id: string) => void;
  analysis?: AnalysisState;
  canAnalyze: boolean;
  onAnalyze: (id: string) => void;
};

export function CameraFeed({
  camera,
  source,
  demo,
  boxes,
  focused,
  time,
  loop,
  running,
  register,
  onMetadata,
  onVideoError,
  onFile,
  onFocus,
  onSettings,
  analysis,
  canAnalyze,
  onAnalyze,
}: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const videoRef = useCallback(
    (video: HTMLVideoElement | null) => register(camera.id, video),
    [camera.id, register],
  );
  const live = analysis ? liveView(analysis.result, analysis.mediaTime) : null;
  const result = analysis
    ? analysis.phase === 'error'
      ? { label: 'Analiz hatası', tone: 'danger' }
      : analysis.phase === 'uploading'
        ? { label: 'Analiz hazırlanıyor', tone: 'idle' }
        : live!.presentation
    : source && !source.error
      ? { label: 'Analiz kapalı', tone: 'idle' }
      : cameraResult(camera, source, demo);
  return (
    <article
      className={`camera-card tone-${result.tone}`}
      data-focused={focused}
      aria-label={`${camera.id} ${camera.name}`}
    >
      <div className="camera-header">
        <span className="camera-id">{camera.id}</span>
        <h2 title={camera.name}>{camera.name}</h2>
        <div className="camera-actions">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`${camera.id} ayarları`}
            onClick={() => onSettings(camera.id)}
          >
            <Settings2 />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={focused ? 'Kamera duvarına dön' : `${camera.id} büyüt`}
            onClick={() => onFocus(camera.id)}
          >
            {focused ? <Minimize /> : <Expand />}
          </Button>
        </div>
      </div>
      <div
        className="camera-picture"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onFile(Array.from(e.dataTransfer.files), camera.id);
        }}
      >
        {source ? (
          <>
            <video
              key={source.url}
              ref={videoRef}
              src={source.url}
              muted
              playsInline
              preload="metadata"
              aria-label={`${camera.id} seçilen video`}
              onLoadedMetadata={(e) =>
                onMetadata(camera.id, source.url, e.currentTarget.duration)
              }
              onError={() => onVideoError(camera.id, source.url)}
            />
            {boxes && analysis?.result && !!live?.detections.length && (
              <svg
                className="live-boxes"
                viewBox={`0 0 ${analysis.result.width} ${analysis.result.height}`}
                preserveAspectRatio="xMidYMid meet"
                aria-label="Modelin gerçek nesne kutuları"
              >
                {live.detections.map((box, index) => {
                  const { width, height } = analysis.result!;
                  const [x1, y1, x2, y2] = box.xyxyn;
                  const color =
                    box.class_name === 'person'
                      ? '#55dda0'
                      : box.class_name === 'forklift_tipped'
                        ? '#ff7782'
                        : '#45c6f0';
                  const fontSize = Math.max(width / 65, 12);
                  return (
                    <g
                      key={`${box.track_id}-${index}`}
                      fill="none"
                      stroke={color}
                    >
                      <rect
                        x={x1 * width}
                        y={y1 * height}
                        width={(x2 - x1) * width}
                        height={(y2 - y1) * height}
                        strokeWidth="2"
                        vectorEffect="non-scaling-stroke"
                      />
                      <text
                        x={x1 * width + 3}
                        y={Math.max(fontSize + 3, y1 * height - 5)}
                        stroke="#07111c"
                        strokeWidth={3}
                        paintOrder="stroke"
                        fill={color}
                        fontSize={fontSize}
                      >
                        {box.class_name}
                        {box.track_id === null ? '' : ` #${box.track_id}`} ·{' '}
                        {box.score.toFixed(2)}
                      </text>
                    </g>
                  );
                })}
              </svg>
            )}
            {!source.duration && !source.error && (
              <div className="video-state">
                <LoaderCircle className="loading-icon" />
                <span>Video hazırlanıyor</span>
              </div>
            )}
            {source.error && (
              <div className="video-state" role="alert">
                <VideoOff />
                <span>{source.error}</span>
                <Button
                  variant="outline"
                  onClick={() => fileInput.current?.click()}
                >
                  Başka video seç
                </Button>
              </div>
            )}
          </>
        ) : demo ? (
          <DemoScene camera={camera} boxes={boxes} />
        ) : (
          <Empty className="camera-empty">
            <EmptyMedia>
              <FileVideo />
            </EmptyMedia>
            <EmptyTitle>Video seç</EmptyTitle>
            <EmptyDescription>
              Bir dosya sürükle veya aşağıdaki düğmeyi kullan.
            </EmptyDescription>
          </Empty>
        )}
        <span className={`picture-label ${source ? 'local-label' : ''}`}>
          <span className="status-dot" />
          {source
            ? running && !source.error
              ? 'OYNATILIYOR'
              : 'YEREL VİDEO'
            : demo
              ? 'STATİK DEMO'
              : 'KAYNAK YOK'}
        </span>
        {source?.duration && !source.error ? (
          <span className="picture-time">
            {formatTime(playbackTarget(time, source.duration, loop))} /{' '}
            {formatTime(source.duration)}
          </span>
        ) : null}
        <button
          className="feed-file-button"
          onClick={() => fileInput.current?.click()}
          aria-label={`${camera.id} için video seç`}
        >
          <FolderOpen size={15} />
          <span>{source ? 'Videoyu değiştir' : 'Video seç'}</span>
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="video/*,.mp4,.webm,.mov,.m4v,.ogv"
          className="sr-only"
          aria-label={`${camera.id} video dosyası`}
          onChange={(e) => {
            if (e.target.files?.length)
              onFile(Array.from(e.target.files), camera.id);
            e.target.value = '';
          }}
        />
      </div>
      <div className="camera-result">
        <span className="status-dot" />
        <span>{result.label}</span>
        {!source && demo && <small>ÖRNEK</small>}
      </div>
      <div className="camera-meta">
        <span>UCF + Forklift</span>
        <span title={source?.name}>
          {source?.name ?? (demo ? 'Temsili görüntü' : 'Dosya seçilmedi')}
        </span>
      </div>
      {source && (
        <div className="camera-analysis-action">
          <Button
            variant="outline"
            size="sm"
            disabled={
              !canAnalyze ||
              !!source.error ||
              !source.duration ||
              analysis?.phase === 'uploading' ||
              analysis?.phase === 'ready'
            }
            onClick={() => onAnalyze(camera.id)}
          >
            {analysis?.phase === 'ready'
              ? 'İki model aktif'
              : analysis?.phase === 'error'
                ? 'Analizi yeniden başlat'
                : 'Birlikte analiz et'}
          </Button>
          <span>
            {analysis ? 'Tek kamera analizi' : 'Seçili kamera iki modele gider'}
          </span>
        </div>
      )}
    </article>
  );
}

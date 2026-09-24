'use client';

import { Button } from '@/components/ui/button';
import type { AnalysisState } from '@/hooks/use-live-analysis';
import { eventPresentation, formatTime } from '@/lib/cameras';
import { liveView } from '@/lib/live-analysis';

export function LiveStatus({
  state,
  stop,
}: {
  state: AnalysisState;
  stop: () => void;
}) {
  const view = liveView(state.result, state.mediaTime);
  const result = state.result;
  return (
    <section className="live-status" aria-label="Birleşik analiz durumu">
      <div className="section-heading">
        <h2>{state.cameraId} · UCF + Forklift</h2>
        <Button variant="outline" size="sm" onClick={stop}>
          Analizi durdur
        </Button>
      </div>
      {state.message && (
        <p role={state.phase === 'error' ? 'alert' : 'status'}>
          {state.message}
        </p>
      )}
      {state.phase === 'ready' && (
        <>
          <p className="live-meta">
            {state.paused
              ? 'Duraklatıldı · yeni analiz yapılmıyor'
              : 'Oynatılan görüntüler analiz ediliyor'}
          </p>
          <div
            className={`live-result tone-${view.ucf ? eventPresentation(view.ucf.class_name).tone : 'idle'}`}
          >
            <strong>UCF · deneysel</strong>
            <span>
              {view.ucf
                ? eventPresentation(view.ucf.class_name).label
                : result && !result.ucf
                  ? `Bağlam birikiyor · en az ${result.min_context_seconds} sn`
                  : 'Güncel sonuç bekleniyor'}
            </span>
            {view.ucf && (
              <small>
                Değerlendirilen geçmiş: {formatTime(view.ucf.window_start_s)}–
                {formatTime(view.ucf.window_end_s)} · {view.ucf.clip_count} klip
              </small>
            )}
          </div>
          <div
            className={`live-result tone-${view.tipped ? 'danger' : 'idle'}`}
          >
            <strong>Forklift + insan</strong>
            <span>
              {view.tipped
                ? 'Devrilmiş forklift tespiti'
                : result && view.lag <= 0.8
                  ? `${view.detections.length} nesne tespiti`
                  : 'Güncel kare sonucu bekleniyor'}
            </span>
          </div>
          {result && (
            <p className="live-meta">
              Son kare: {result.frame_time_s.toFixed(2)} sn · İşlem:{' '}
              {Math.round(result.processing_ms)} ms · Görüntü farkı:{' '}
              {view.lag.toFixed(1)} sn
            </p>
          )}
          {view.lag > 0.8 && (
            <p className="analysis-warning">
              Analiz görüntünün gerisinde. Eski kutular gizlendi; gerekirse
              oynatma hızını düşür.
            </p>
          )}
          {result?.reset_reason === 'time_gap' &&
            result.context_seconds < result.min_context_seconds && (
              <p className="analysis-warning">
                Zaman atlaması nedeniyle takip ve UCF geçmişi yeniden
                başlatıldı.
              </p>
            )}
        </>
      )}
      <p className="sidebar-note">
        UCF son yaklaşık 8 saniyedeki örneklenmiş klipleri değerlendirir. Bu
        pencere olayın kesin başlangıç/bitişi değildir. İlk kısa-pencere sürümü;
        yanlış alarm ve kaçırma olabilir.
      </p>
    </section>
  );
}

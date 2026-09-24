'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Bell,
  Boxes,
  CircleHelp,
  FolderOpen,
  Info,
  LayoutGrid,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarProvider,
} from '@/components/ui/sidebar';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { CameraFeed, cameraResult, DemoScene } from '@/components/camera-feed';
import { formatTime } from '@/lib/cameras';
import { useVideoWall } from '@/hooks/use-video-wall';
import { useWallTools } from '@/hooks/use-wall-tools';
import { useLiveAnalysis } from '@/hooks/use-live-analysis';
import { LiveStatus } from '@/components/live-status';

export default function Home() {
  const wall = useVideoWall();
  const analysis = useLiveAnalysis(wall);
  const batchInput = useRef<HTMLInputElement>(null);
  const [demo, setDemo] = useState(true);
  const [boxes, setBoxes] = useState(true);
  const [focused, setFocused] = useState<string | null>(null);
  const [settingsCamera, setSettingsCamera] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const { cameras, sources, playback, notice } = wall;
  const loadedCount = Object.keys(sources).length;
  const readyCount = Object.values(sources).filter(
    (s) => s.duration && !s.error,
  ).length;
  const selectedCamera = cameras.find((c) => c.id === settingsCamera);
  const focusedCamera = cameras.find((c) => c.id === focused);
  const alerts =
    demo && !analysis.state.cameraId
      ? cameras.filter(
          (c) =>
            !sources[c.id] &&
            ['danger', 'warning'].includes(
              cameraResult(c, undefined, demo).tone,
            ),
        )
      : [];
  const anyDemo = demo && loadedCount < cameras.length;

  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFocused(null);
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, []);

  useWallTools({
    cameras,
    sources,
    playback,
    focused,
    play: wall.play,
    pause: wall.pause,
    reset: wall.reset,
    focus: setFocused,
    modelConnected: !!analysis.health?.ready,
    analysisCamera: analysis.state.cameraId,
    analysisPhase: analysis.state.phase,
  });

  return (
    <div className="monitor-app">
      <a href="#camera-wall" className="skip-link">
        Kameralara geç
      </a>
      <header className="topbar">
        <button
          type="button"
          onClick={() => setFocused(null)}
          className="brand"
          aria-label="Teklas güvenlik izleme ana sayfa"
        >
          <span className="brand-icon">
            <ShieldCheck />
          </span>
          <strong>
            teklas<span className="brand-dot">.</span>
          </strong>
          <span className="brand-divider" />
          <span className="brand-context">Güvenlik izleme</span>
        </button>
        <span className="demo-badge">
          <span className="status-dot" />
          {analysis.health?.ready
            ? 'YEREL ANALİZ · TEK KAMERA'
            : 'MODEL SERVİSİ BAĞLI DEĞİL'}
        </span>
        <div className="model-chips">
          <span>
            UCF <b>best.pt</b>
          </span>
          <span>
            Forklift <b>3 sınıf</b>
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Model bağlantısı hakkında"
            onClick={() => setInfoOpen(true)}
          >
            <CircleHelp />
          </Button>
        </div>
      </header>
      <SidebarProvider className="workspace min-h-0">
        <Sidebar
          collapsible="none"
          className="navigation-rail h-auto! w-[84px]!"
          aria-label="Ana gezinme"
        >
          <SidebarContent className="rail-content">
            <Button
              variant="ghost"
              className="rail-button rail-active"
              aria-label="Kamera duvarı"
              aria-current="page"
              onClick={() => setFocused(null)}
            >
              <LayoutGrid />
              <span>Kameralar</span>
            </Button>
            <Button
              variant="ghost"
              className="rail-button"
              aria-label="Kameralar için video seç"
              onClick={() => batchInput.current?.click()}
            >
              <FolderOpen />
              <span>Videolar</span>
            </Button>
            <Button
              variant="ghost"
              className="rail-button"
              aria-label="Görünüm ayarları"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings2 />
              <span>Ayarlar</span>
            </Button>
          </SidebarContent>
          <SidebarFooter className="rail-bottom">
            <ShieldCheck />
            <span>YEREL</span>
          </SidebarFooter>
        </Sidebar>
        <main className="main-workspace" id="camera-wall">
          <div className="page-heading">
            <div>
              <p className="eyebrow">İZLEME MERKEZİ</p>
              <h1>
                {focusedCamera ? focusedCamera.name : 'Kamera duvarı'}{' '}
                <span>{focusedCamera?.id ?? '06'}</span>
              </h1>
              <p className="page-caption">
                {loadedCount
                  ? `${loadedCount} yerel video · ${readyCount} oynatılabilir`
                  : '6 kamera alanı · videolarını seçerek başla'}
                {anyDemo ? ' · statik örnekler gösteriliyor' : ''}
              </p>
            </div>
            <div className="heading-actions">
              {focused && (
                <Button variant="outline" onClick={() => setFocused(null)}>
                  <ArrowLeft />
                  Duvara dön
                </Button>
              )}
              <Button
                className="upload-button"
                onClick={() => batchInput.current?.click()}
              >
                <Upload />
                Videoları seç
              </Button>
            </div>
            <input
              ref={batchInput}
              type="file"
              multiple
              accept="video/*,.mp4,.webm,.mov,.m4v,.ogv"
              className="sr-only"
              aria-label="Altı kamera için video dosyaları"
              onChange={(e) => {
                if (e.target.files?.length)
                  wall.addFiles(Array.from(e.target.files));
                e.target.value = '';
              }}
            />
          </div>
          <div className="wall-toolbar">
            <div className="wall-toolbar-left">
              <span className="connection-label">
                <span className="status-dot" />
                {analysis.health?.ready
                  ? `İki model hazır · ${analysis.health.device.toUpperCase()}`
                  : 'Yerel servis bekleniyor'}
              </span>
              <span className="toolbar-divider" />
              <span className="muted-copy">Ses kapalı</span>
            </div>
            <label htmlFor="demo-switch" className="switch-label">
              <Switch
                id="demo-switch"
                checked={demo}
                onCheckedChange={setDemo}
                aria-label="Örnek görüntüleri ve sonuçları göster"
              />
              Örnek görünüm
            </label>
          </div>
          {!analysis.health?.ready && (
            <div className="backend-notice" role="status">
              {analysis.health?.error ||
                'Analiz için ayrı terminalde .venv/bin/python src/serve_camera.py çalıştır. Ardından videonun altındaki “Birlikte analiz et” düğmesini kullan.'}
            </div>
          )}
          <div className="monitor-layout">
            <section
              className={`camera-grid ${focused ? 'is-focused' : ''}`}
              aria-label="Kamera görüntüleri"
            >
              {cameras.map((camera) => (
                <CameraFeed
                  key={camera.id}
                  camera={camera}
                  source={sources[camera.id]}
                  demo={demo}
                  boxes={boxes}
                  focused={focused === camera.id}
                  time={playback.time}
                  loop={playback.loop}
                  running={playback.running}
                  register={wall.register}
                  onMetadata={wall.onMetadata}
                  onVideoError={wall.onVideoError}
                  onFile={wall.addFiles}
                  onFocus={(id) =>
                    setFocused((previous) => (previous === id ? null : id))
                  }
                  onSettings={setSettingsCamera}
                  analysis={
                    analysis.state.cameraId === camera.id
                      ? analysis.state
                      : undefined
                  }
                  canAnalyze={!!analysis.health?.ready}
                  onAnalyze={(id) => {
                    wall.pause();
                    const error = analysis.start(id);
                    if (error) wall.setNotice(error);
                  }}
                />
              ))}
            </section>
            <aside className="event-sidebar" aria-label="Analiz ve uyarılar">
              {analysis.state.cameraId && (
                <LiveStatus state={analysis.state} stop={analysis.stop} />
              )}
              {!analysis.state.cameraId && (
                <>
                  <div className="section-heading">
                    <h2>
                      <Bell size={17} />
                      Örnek uyarılar
                    </h2>
                    <span className="count-badge">{alerts.length}</span>
                  </div>
                  <p className="sidebar-note">
                    Bu liste tasarım içindir. Seçtiğin videolardan üretilmez.
                  </p>
                  {alerts.length ? (
                    alerts.map((camera) => {
                      const result = cameraResult(camera, undefined, demo);
                      return (
                        <article
                          className={`event-card tone-${result.tone}`}
                          key={camera.id}
                        >
                          <div className="event-card-main">
                            <DemoScene
                              camera={camera}
                              className="event-thumbnail"
                            />
                            <div>
                              <p className="event-camera">
                                {camera.id} · {camera.name}
                              </p>
                              <h3>{result.label}</h3>
                            </div>
                          </div>
                          <div className="event-card-bottom">
                            <span className="event-tag">
                              <span className="status-dot" />
                              TEMSİLİ
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setFocused(camera.id)}
                              aria-label={`${camera.id} örnek uyarısını incele`}
                            >
                              İncele
                              <ArrowUpRight />
                            </Button>
                          </div>
                        </article>
                      );
                    })
                  ) : (
                    <Empty className="alerts-empty">
                      <EmptyMedia>
                        <Bell />
                      </EmptyMedia>
                      <EmptyTitle>Gösterilecek uyarı yok</EmptyTitle>
                      <EmptyDescription>
                        Bir video seçip “Birlikte analiz et” düğmesine bas.
                        Model sonuçları burada gösterilecek.
                      </EmptyDescription>
                    </Empty>
                  )}
                </>
              )}
              <div className="box-legend">
                <div className="legend-heading">
                  <Boxes size={16} />
                  <h3>Nesne kutuları</h3>
                </div>
                <label htmlFor="boxes-switch" className="switch-label">
                  <Switch
                    id="boxes-switch"
                    checked={boxes}
                    onCheckedChange={setBoxes}
                    aria-label="Nesne kutularını göster"
                  />
                  Kutuları göster
                </label>
                <div className="legend-items">
                  <span>
                    <i className="legend-box person" />
                    person
                  </span>
                  <span>
                    <i className="legend-box forklift" />
                    forklift
                  </span>
                  <span>
                    <i className="legend-box tipped" />
                    forklift_tipped
                  </span>
                </div>
                <p>
                  Analiz açıkken gerçek kutular ve takip ID’leri gösterilir.
                  Örnek kutular yalnızca statik demodadır.
                </p>
              </div>
              <div className="privacy-note">
                <ShieldCheck size={17} />
                <p>
                  Videolar cihazında kalır.
                  <br />
                  <span>
                    Seçili video yalnızca bu bilgisayardaki analiz servisine
                    aktarılır; internete yüklenmez.
                  </span>
                </p>
              </div>
            </aside>
          </div>
          <div className="wall-footnote">
            <Info size={14} />
            <span>
              Tek kamerada oynatma sırasında iki model çalışır. UCF kısa-geçmiş
              sonuçları deneyseldir; kesin olay zamanı değildir.
            </span>
            <button onClick={() => setInfoOpen(true)}>
              Detaylar
              <ArrowUpRight size={13} />
            </button>
          </div>
        </main>
      </SidebarProvider>
      <footer className="transport" aria-label="Toplu video kontrolleri">
        <div className="transport-buttons">
          <Button
            className="transport-play"
            size="icon"
            disabled={!readyCount}
            aria-label={
              playback.running
                ? 'Tüm videoları duraklat'
                : 'Tüm videoları oynat'
            }
            onClick={playback.running ? wall.pause : wall.play}
          >
            {playback.running ? (
              <Pause fill="currentColor" />
            ) : (
              <Play fill="currentColor" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Videoları başa sar"
            disabled={!readyCount}
            onClick={wall.reset}
          >
            <RotateCcw />
          </Button>
        </div>
        <div className="transport-clock">
          <span>{formatTime(playback.time)}</span>
          <span> / {formatTime(playback.duration)}</span>
        </div>
        <div className="seek-control">
          <Slider
            min={0}
            max={Math.max(1, playback.duration)}
            step={0.1}
            value={[playback.time]}
            onValueChange={(value) =>
              wall.seek(Array.isArray(value) ? value[0] : value)
            }
            disabled={!readyCount}
            aria-label="Tüm videoların oynatma konumu"
          />
          <span>
            {loadedCount
              ? 'Ortak oynatma zamanı'
              : 'Oynatmak için bir video seç'}
          </span>
        </div>
        <Select
          value={String(playback.rate)}
          onValueChange={(value) => {
            if (value) wall.setRate(Number(value));
          }}
        >
          <SelectTrigger className="rate-select" aria-label="Oynatma hızı">
            <SelectValue>{playback.rate}×</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {[0.5, 1, 1.5, 2].map((rate) => (
              <SelectItem value={String(rate)} key={rate}>
                {rate}×
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label htmlFor="loop-switch" className="switch-label loop-control">
          <Switch
            id="loop-switch"
            checked={playback.loop}
            onCheckedChange={wall.setLoop}
            aria-label="Videoları döngüde oynat"
          />
          Döngü
        </label>
      </footer>
      <output
        className={`notice ${notice ? 'notice-visible' : ''}`}
        aria-live="polite"
      >
        {notice && (
          <>
            <Info size={17} />
            <span>{notice}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Bildirimi kapat"
              onClick={() => wall.setNotice('')}
            >
              <X />
            </Button>
          </>
        )}
      </output>

      <Dialog
        open={!!selectedCamera}
        onOpenChange={(open) => {
          if (!open) setSettingsCamera(null);
        }}
      >
        <DialogContent
          className="camera-dialog sm:max-w-lg"
          showCloseButton={false}
        >
          <DialogHeader>
            <DialogTitle>{selectedCamera?.id} · Kamera ayarları</DialogTitle>
            <DialogDescription>
              Kamera adını ve videosunu düzenle. Analiz her zaman UCF + Forklift
              kullanır.
            </DialogDescription>
          </DialogHeader>
          <DialogClose
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="dialog-close"
                aria-label="Kamera ayarlarını kapat"
              />
            }
          >
            <X />
          </DialogClose>
          {selectedCamera && (
            <>
              <div className="form-field">
                <Label htmlFor="camera-name">Konum adı</Label>
                <Input
                  id="camera-name"
                  maxLength={48}
                  value={selectedCamera.name}
                  onChange={(e) =>
                    wall.updateCamera(selectedCamera.id, {
                      name: e.target.value,
                    })
                  }
                  onBlur={(e) => {
                    if (!e.target.value.trim())
                      wall.updateCamera(selectedCamera.id, { name: 'Kamera' });
                  }}
                />
              </div>
              <div className="form-field">
                <Label>Birleşik analiz · UCF + Forklift</Label>
                <p className="field-note">
                  Aynı video iki modele gider. İlk sürümde aynı anda bir kamera
                  analiz edilir.
                </p>
              </div>
              <div className="source-details">
                <FolderOpen size={18} />
                <span>
                  {sources[selectedCamera.id]?.name ?? 'Henüz video seçilmedi'}
                </span>
              </div>
              <div className="dialog-actions">
                <Label className="file-picker-label">
                  Video seç
                  <input
                    type="file"
                    accept="video/*,.mp4,.webm,.mov,.m4v,.ogv"
                    aria-label={`${selectedCamera.id} için yeni video`}
                    onChange={(e) => {
                      if (e.target.files?.length)
                        wall.addFiles(
                          Array.from(e.target.files),
                          selectedCamera.id,
                        );
                      e.target.value = '';
                    }}
                  />
                </Label>
                {sources[selectedCamera.id] && (
                  <Button
                    variant="outline"
                    onClick={() => wall.removeSource(selectedCamera.id)}
                  >
                    Panelden kaldır
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent
          className="camera-dialog sm:max-w-lg"
          showCloseButton={false}
        >
          <DialogHeader>
            <DialogTitle>Görünüm ayarları</DialogTitle>
            <DialogDescription>
              Bu tercihler yalnızca açık oturum için geçerlidir.
            </DialogDescription>
          </DialogHeader>
          <DialogClose
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="dialog-close"
                aria-label="Görünüm ayarlarını kapat"
              />
            }
          >
            <X />
          </DialogClose>
          <label htmlFor="settings-demo" className="setting-row">
            <span>
              Örnek görünüm
              <small>
                Boş kameralarda statik görüntü ve temsili sonuç göster.
              </small>
            </span>
            <Switch
              id="settings-demo"
              checked={demo}
              onCheckedChange={setDemo}
            />
          </label>
          <label htmlFor="settings-boxes" className="setting-row">
            <span>
              Nesne kutuları
              <small>Kendi videolarına sahte tespit kutusu çizilmez.</small>
            </span>
            <Switch
              id="settings-boxes"
              checked={boxes}
              onCheckedChange={setBoxes}
            />
          </label>
          <label htmlFor="settings-loop" className="setting-row">
            <span>
              Video döngüsü
              <small>
                Kısa videolar kendi sonlarına ulaştığında başa döner.
              </small>
            </span>
            <Switch
              id="settings-loop"
              checked={playback.loop}
              onCheckedChange={wall.setLoop}
            />
          </label>
          <p className="field-note">
            Videolar sessiz oynatılır. Sayfa yenilenirse dosyalarını yeniden
            seçmen gerekir.
          </p>
        </DialogContent>
      </Dialog>

      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent
          className="camera-dialog sm:max-w-lg"
          showCloseButton={false}
        >
          <DialogHeader>
            <DialogTitle>Yerel birleşik analiz</DialogTitle>
            <DialogDescription>
              Video oynarken UCF + Forklift. İlk sürümde bir aktif analiz
              kamerası.
            </DialogDescription>
          </DialogHeader>
          <DialogClose
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="dialog-close"
                aria-label="Bilgi penceresini kapat"
              />
            }
          >
            <X />
          </DialogClose>
          <div className="info-block">
            <h3>UCF · best.pt</h3>
            <p>
              Normal → Normal
              <br />
              Arson → Yangın ve patlama tehlikesi (Arson)
              <br />
              Fighting / Assault → Olası şiddet olayı (ilgili sınıf)
            </p>
            <p>
              Model video-geneli eğitilmiştir. Bu yeni çıkarım modu son yaklaşık
              8 saniyeyi kullanır; en az 4 saniye bağlam bekler. Kısa pencere
              başarısı ayrıca test edilmelidir. Kesin olay zamanı veya ayrı
              patlama sınıfı üretmez.
            </p>
          </div>
          <div className="info-block">
            <h3>Forklift · 3 sınıf</h3>
            <p>
              person, forklift ve forklift_tipped kutuları ile ByteTrack
              ID’leri. Normal UCF sonucu, devrilmiş forklift tespitini
              bastırmaz. Takip ID’leri sarma, döngü ve kamera değişiminde
              sıfırlanır.
            </p>
          </div>
          <p className="field-note">
            Örnek görüntüler yapay zekâ ile oluşturulmuştur. Gösterilen örnek
            kutular ve uyarılar model çıktısı değildir.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}

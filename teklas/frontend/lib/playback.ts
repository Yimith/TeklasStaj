import { playbackTarget } from './cameras.ts';

export interface MediaSurface {
  duration: number;
  currentTime: number;
  playbackRate: number;
  paused: boolean;
  readyState: number;
  play(): Promise<void>;
  pause(): void;
}

export class PlaybackController {
  private media = new Map<string, MediaSurface>();
  private failed = new Set<string>();
  private pending = new Map<string, MediaSurface>();
  private anchorTime = 0;
  private anchorPosition = 0;
  time = 0;
  running = false;
  loop = true;
  rate = 1;
  private now: () => number;
  private onError: (id: string, message: string) => void;

  constructor(
    now: () => number = () => performance.now(),
    onError: (id: string, message: string) => void = () => {},
  ) {
    this.now = now;
    this.onError = onError;
  }

  get duration(): number {
    return Math.max(
      0,
      ...[...this.media]
        .filter(
          ([id, m]) =>
            !this.failed.has(id) &&
            Number.isFinite(m.duration) &&
            m.duration > 0,
        )
        .map(([, m]) => m.duration),
    );
  }

  attach(id: string, media: MediaSurface | null) {
    const previous = this.media.get(id);
    if (previous && previous !== media) previous.pause();
    this.failed.delete(id);
    this.pending.delete(id);
    if (media) this.media.set(id, media);
    else this.media.delete(id);
    this.sync(true);
  }

  fail(id: string, message: string) {
    this.failed.add(id);
    this.media.get(id)?.pause();
    this.onError(id, message);
    if (!this.duration) this.pause();
  }

  play() {
    if (!this.duration) return false;
    if (this.time >= this.duration) this.time = 0;
    this.anchorPosition = this.time;
    this.anchorTime = this.now();
    this.running = true;
    this.sync(true);
    return true;
  }

  pause() {
    if (this.running) this.updateClock();
    this.running = false;
    for (const m of this.media.values()) m.pause();
  }

  seek(time: number) {
    this.time = Math.max(
      0,
      Math.min(Number.isFinite(time) ? time : 0, this.duration),
    );
    this.anchorPosition = this.time;
    this.anchorTime = this.now();
    this.sync(true);
  }

  setRate(rate: number) {
    if (![0.5, 1, 1.5, 2].includes(rate)) return;
    if (this.running) this.updateClock();
    this.rate = rate;
    this.anchorPosition = this.time;
    this.anchorTime = this.now();
    this.sync();
  }

  setLoop(loop: boolean) {
    if (this.running) this.updateClock();
    this.loop = loop;
    this.anchorPosition = this.time;
    this.anchorTime = this.now();
    this.sync(true);
  }

  private updateClock() {
    const duration = this.duration;
    if (!duration) {
      this.time = 0;
      this.running = false;
      return;
    }
    const elapsed = Math.max(0, (this.now() - this.anchorTime) / 1000);
    const next = this.anchorPosition + elapsed * this.rate;
    this.time = playbackTarget(next, duration, this.loop);
    if (!this.loop && next >= duration) this.running = false;
  }

  tick() {
    if (this.running) this.updateClock();
    this.sync();
    return this.snapshot();
  }

  snapshot() {
    return {
      time: this.time,
      duration: this.duration,
      running: this.running,
      loop: this.loop,
      rate: this.rate,
    };
  }

  sync(force = false) {
    for (const [id, m] of this.media) {
      if (
        this.failed.has(id) ||
        m.readyState < 1 ||
        !Number.isFinite(m.duration) ||
        m.duration <= 0
      )
        continue;
      const target = playbackTarget(this.time, m.duration, this.loop);
      m.playbackRate = this.rate;
      try {
        if (force || Math.abs(m.currentTime - target) > 0.4)
          m.currentTime = target;
      } catch {
        continue;
      }
      const shouldPlay = this.running && (this.loop || this.time < m.duration);
      if (!shouldPlay) {
        if (!m.paused) m.pause();
        continue;
      }
      if (!m.paused || this.pending.get(id) === m) continue;
      this.pending.set(id, m);
      try {
        void Promise.resolve(m.play())
          .then(() => {
            if (!this.running || this.media.get(id) !== m) m.pause();
          })
          .catch((error: unknown) => {
            if (!this.running || this.media.get(id) !== m) return;
            if (error instanceof Error && error.name === 'AbortError') return;
            this.fail(id, 'Video oynatılamadı. MP4 (H.264) veya WebM deneyin.');
          })
          .finally(() => {
            if (this.pending.get(id) === m) this.pending.delete(id);
          });
      } catch {
        this.pending.delete(id);
        this.fail(id, 'Video oynatılamadı. Başka bir video seçin.');
      }
    }
  }

  destroy() {
    this.pause();
    this.media.clear();
    this.pending.clear();
    this.failed.clear();
  }
}

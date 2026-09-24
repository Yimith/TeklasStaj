import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CAMERAS,
  cameraResult,
  eventPresentation,
  formatTime,
  isVideoFile,
  playbackTarget,
} from '../lib/cameras.ts';
import { PlaybackController, type MediaSurface } from '../lib/playback.ts';

function media(duration = 10): MediaSurface {
  return {
    duration,
    currentTime: 0,
    playbackRate: 1,
    paused: true,
    readyState: 4,
    async play() {
      this.paused = false;
    },
    pause() {
      this.paused = true;
    },
  };
}

void test('six cameras with unique ids and distinct demo scenes', () => {
  assert.equal(CAMERAS.length, 6);
  assert.equal(new Set(CAMERAS.map((c) => c.id)).size, 6);
  assert.deepEqual(
    CAMERAS.map((c) => c.scene),
    [0, 1, 2, 3, 4, 5],
  );
});
void test('event labels keep the original class; unknown classes are not called violence', () => {
  assert.equal(
    eventPresentation('Arson').label,
    'Yangın ve patlama tehlikesi (Arson)',
  );
  assert.equal(
    eventPresentation('Fighting').label,
    'Olası şiddet olayı (Fighting)',
  );
  assert.equal(
    eventPresentation('Assault').label,
    'Olası şiddet olayı (Assault)',
  );
  assert.equal(eventPresentation('Normal').label, 'Normal');
  assert.equal(eventPresentation('Explosion').tone, 'idle');
});
void test('time formatting handles hours and invalid durations', () => {
  assert.equal(formatTime(65.4), '01:05');
  assert.equal(formatTime(3605), '1:00:05');
  assert.equal(formatTime(NaN), '00:00');
  assert.equal(formatTime(-10), '00:00');
});
void test('uploaded videos never inherit demo alarms or normal labels', () => {
  for (const camera of CAMERAS) {
    assert.equal(cameraResult(camera, {}, true).label, 'Analiz bağlı değil');
    assert.equal(cameraResult(camera, {}, false).tone, 'idle');
    assert.equal(
      cameraResult(camera, { error: 'decode' }, true).label,
      'Video açılamadı',
    );
  }
  assert.equal(cameraResult(CAMERAS[2], undefined, true).tone, 'warning');
  assert.equal(cameraResult(CAMERAS[2], undefined, false).tone, 'idle');
});
void test('local file filter accepts video and rejects empty/non-video files', () => {
  assert.ok(isVideoFile({ name: 'kamera.MP4', type: '', size: 100 }));
  assert.ok(isVideoFile({ name: 'örnek.webm', type: 'video/webm', size: 100 }));
  assert.ok(!isVideoFile({ name: 'kamera.mp4', type: 'video/mp4', size: 0 }));
  assert.ok(!isVideoFile({ name: 'model.pt', type: '', size: 100 }));
});
void test('playback clamps or wraps correctly', () => {
  assert.equal(playbackTarget(23, 10, true), 3);
  assert.equal(playbackTarget(23, 10, false), 10);
  assert.equal(playbackTarget(23, NaN, true), 0);
  assert.equal(playbackTarget(-4, 10, true), 0);
});
void test('empty wall cannot start, and metadata-less media is ignored', () => {
  const c = new PlaybackController();
  assert.equal(c.play(), false);
  c.attach('a', media(NaN));
  assert.equal(c.play(), false);
  assert.equal(c.duration, 0);
});
void test('six videos share clock while short videos loop independently', () => {
  let now = 0;
  const c = new PlaybackController(() => now);
  const videos = [4, 5, 6, 8, 10, 12].map(media);
  videos.forEach((m, i) => c.attach(String(i), m));
  assert.equal(c.play(), true);
  now = 5500;
  c.tick();
  assert.equal(c.time, 5.5);
  assert.equal(videos[0].currentTime, 1.5);
  assert.equal(videos[1].currentTime, 0.5);
  assert.equal(videos[5].currentTime, 5.5);
  assert.ok(videos.every((m) => !m.paused));
  c.destroy();
  assert.ok(videos.every((m) => m.paused));
});
void test('without loop, short videos stop and the wall stops at the longest duration', () => {
  let now = 0;
  const c = new PlaybackController(() => now);
  const short = media(4),
    long = media(10);
  c.attach('short', short);
  c.attach('long', long);
  c.setLoop(false);
  c.play();
  now = 5000;
  c.tick();
  assert.equal(short.paused, true);
  assert.equal(long.paused, false);
  now = 11000;
  c.tick();
  assert.equal(c.running, false);
  assert.equal(c.time, 10);
  assert.equal(long.paused, true);
});
void test('pause, seek, speed and restart preserve the correct position', () => {
  let now = 0;
  const c = new PlaybackController(() => now);
  const m = media(20);
  c.attach('a', m);
  c.play();
  now = 3000;
  c.pause();
  assert.equal(c.time, 3);
  assert.equal(m.paused, true);
  now = 8000;
  c.tick();
  assert.equal(c.time, 3);
  c.seek(8);
  c.setRate(2);
  c.play();
  now = 9000;
  c.tick();
  assert.equal(c.time, 10);
  assert.equal(m.playbackRate, 2);
  c.setRate(99);
  assert.equal(c.rate, 2);
  c.seek(-5);
  assert.equal(c.time, 0);
  c.destroy();
});
void test('replacing a camera pauses old media and updates duration', () => {
  const c = new PlaybackController();
  const old = media(12),
    next = media(7);
  c.attach('a', old);
  c.play();
  c.attach('a', next);
  assert.equal(old.paused, true);
  assert.equal(c.duration, 7);
  c.attach('a', null);
  assert.equal(next.paused, true);
  assert.equal(c.duration, 0);
});
void test('decode errors remove unusable cameras from the clock', () => {
  const errors: string[] = [];
  const c = new PlaybackController(undefined, (id) => errors.push(id));
  const bad = media(20);
  c.attach('bad', bad);
  c.play();
  c.fail('bad', 'decode');
  assert.equal(c.duration, 0);
  assert.equal(c.running, false);
  assert.equal(bad.paused, true);
  assert.deepEqual(errors, ['bad']);
});
void test('play rejection is handled without unhandled promises', async () => {
  const errors: string[] = [];
  const c = new PlaybackController(undefined, (id) => errors.push(id));
  const bad = media();
  bad.play = async () => {
    throw new Error('unsupported codec');
  };
  c.attach('bad', bad);
  c.play();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(errors, ['bad']);
  assert.equal(c.running, false);
});
void test('late play promise cannot resume a removed video', async () => {
  let resolvePlay: () => void = () => {};
  const c = new PlaybackController();
  const m = media();
  m.play = () =>
    new Promise<void>((resolve) => {
      resolvePlay = () => {
        m.paused = false;
        resolve();
      };
    });
  c.attach('a', m);
  c.play();
  c.attach('a', null);
  resolvePlay();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(m.paused, true);
});

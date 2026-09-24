import assert from 'node:assert/strict';
import { test } from 'node:test';
import { liveView, type LiveResult } from '../lib/live-analysis.ts';
import { CAMERAS } from '../lib/cameras.ts';

const result: LiveResult = {
  generation: 1,
  frame_time_s: 8,
  width: 640,
  height: 360,
  detections: [
    {
      class_name: 'forklift_tipped',
      score: 0.8,
      track_id: 1,
      xyxyn: [0.1, 0.1, 0.8, 0.8],
    },
  ],
  ucf: {
    class_name: 'Normal',
    scores: { Normal: 0.8 },
    window_start_s: 0,
    window_end_s: 8,
    clip_count: 10,
    experimental: true,
  },
  context_seconds: 8,
  min_context_seconds: 4,
  reset_reason: 'started',
  processing_ms: 100,
};
void test('all cameras use both models', () =>
  assert.ok(CAMERAS.every((c) => c.mode === 'both')));
void test('Normal does not hide tipped forklift', () => {
  const view = liveView(result, 8.2);
  assert.equal(view.presentation.label, 'Devrilmiş forklift');
  assert.equal(view.ucf?.class_name, 'Normal');
});
void test('future and stale results cannot appear current', () => {
  for (const at of [2, 12]) {
    const view = liveView(result, at);
    assert.equal(view.ucf, null);
    assert.deepEqual(view.detections, []);
    assert.equal(view.presentation.tone, 'idle');
  }
  assert.deepEqual(liveView(result, 9).detections, []);
  assert.equal(liveView(result, 9).ucf?.class_name, 'Normal');
});
void test('missing UCF result is not Normal and object warning is independent', () => {
  assert.equal(liveView(null, 0).presentation.tone, 'idle');
  assert.equal(
    liveView({ ...result, ucf: null }, 8).presentation.label,
    'Devrilmiş forklift',
  );
});

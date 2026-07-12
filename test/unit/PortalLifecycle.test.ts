/**
 * S9.8 — PortalLifecycle: init->loadingFinished ordering, gameplayStart/Stop
 * pass-through, commercialBreak wraps mute+input-suspend and restores after
 * (even on rejection).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createAudioExecutor } from '../../render/audio/AudioExecutor';
import { createTraceAudioDevice } from '../../render/audio/AudioDevice';
import { createPortalLifecycle } from '../../render/shell/PortalLifecycle';
import type { PortalSdk } from '../../render/shell/PortalSdk';

function makeRecordingSdk(overrides: Partial<PortalSdk> = {}): { sdk: PortalSdk; calls: string[] } {
  const calls: string[] = [];
  const sdk: PortalSdk = {
    async init() {
      calls.push('init');
    },
    gameLoadingFinished() {
      calls.push('gameLoadingFinished');
    },
    gameplayStart() {
      calls.push('gameplayStart');
    },
    gameplayStop() {
      calls.push('gameplayStop');
    },
    async commercialBreak(onStart) {
      calls.push('commercialBreak:start');
      onStart?.();
      calls.push('commercialBreak:end');
    },
    async rewardedBreak() {
      return false;
    },
    ...overrides,
  };
  return { sdk, calls };
}

test('boot() then reportLoadingFinished() calls init then gameLoadingFinished, in order', async () => {
  const { sdk, calls } = makeRecordingSdk();
  const executor = createAudioExecutor(createTraceAudioDevice().device);
  const lifecycle = createPortalLifecycle(sdk, executor);
  await lifecycle.boot();
  lifecycle.reportLoadingFinished();
  assert.deepEqual(calls, ['init', 'gameLoadingFinished']);
});

test('notifyGameplayStart/Stop pass straight through to the SDK', () => {
  const { sdk, calls } = makeRecordingSdk();
  const executor = createAudioExecutor(createTraceAudioDevice().device);
  const lifecycle = createPortalLifecycle(sdk, executor);
  lifecycle.notifyGameplayStart();
  lifecycle.notifyGameplayStop();
  assert.deepEqual(calls, ['gameplayStart', 'gameplayStop']);
});

test('requestBreak mutes audio and raises inputSuspended BEFORE the break, and restores both AFTER', async () => {
  const { sdk, calls } = makeRecordingSdk();
  const { device, trace } = createTraceAudioDevice();
  const executor = createAudioExecutor(device);
  const lifecycle = createPortalLifecycle(sdk, executor);

  let suspendedDuringBreak: boolean | null = null;
  await lifecycle.requestBreak(() => {
    suspendedDuringBreak = lifecycle.inputSuspended;
  });

  assert.equal(suspendedDuringBreak, true, 'input must already be suspended when the break actually starts');
  assert.equal(lifecycle.inputSuspended, false, 'input suspension must lift once the break resolves');
  assert.equal(executor.muted, false, 'audio must be unmuted again after the break');
  assert.deepEqual(calls, ['commercialBreak:start', 'commercialBreak:end']);
  assert.ok(trace().includes('setMasterGain(0)'));
  assert.ok(trace().includes('setMasterGain(1)'));
  assert.ok(trace().indexOf('setMasterGain(0)') < trace().indexOf('setMasterGain(1)'));
});

test('requestBreak still restores audio and input even if the SDK break rejects', async () => {
  const { sdk } = makeRecordingSdk({
    async commercialBreak(): Promise<void> {
      throw new Error('ad network unreachable');
    },
  });
  const { device } = createTraceAudioDevice();
  const executor = createAudioExecutor(device);
  const lifecycle = createPortalLifecycle(sdk, executor);

  await assert.rejects(() => lifecycle.requestBreak());
  assert.equal(lifecycle.inputSuspended, false, 'a rejected break must not leave input permanently suspended');
  assert.equal(executor.muted, false, 'a rejected break must not leave audio permanently muted');
});

test('requestRewardedSkip (REQ-174, S11.2): mutes audio and suspends input for the duration, resolves true when the SDK reports the reward watched through', async () => {
  const { device, trace } = createTraceAudioDevice();
  const executor = createAudioExecutor(device);
  let suspendedDuringBreak: boolean | null = null;
  const sdk: PortalSdk = {
    async init() {},
    gameLoadingFinished() {},
    gameplayStart() {},
    gameplayStop() {},
    async commercialBreak() {},
    async rewardedBreak(options) {
      suspendedDuringBreak = lifecycle.inputSuspended;
      assert.deepEqual(options, { size: 'large' }, 'options must reach the SDK verbatim');
      return true;
    },
  };
  const lifecycle = createPortalLifecycle(sdk, executor);

  const granted = await lifecycle.requestRewardedSkip({ size: 'large' });

  assert.equal(granted, true, 'must surface the SDK\'s own true/false result, not assume success');
  assert.equal(suspendedDuringBreak, true, 'input must already be suspended while the rewarded break plays');
  assert.equal(lifecycle.inputSuspended, false, 'input suspension must lift once the break resolves');
  assert.equal(executor.muted, false, 'audio must be unmuted again after the break');
  assert.ok(trace().includes('setMasterGain(0)'));
  assert.ok(trace().includes('setMasterGain(1)'));
});

test('requestRewardedSkip resolves false (never throws) when the player declines or the SDK reports no reward — no bypass exists', async () => {
  const { sdk } = makeRecordingSdk({ async rewardedBreak() { return false; } });
  const executor = createAudioExecutor(createTraceAudioDevice().device);
  const lifecycle = createPortalLifecycle(sdk, executor);

  const granted = await lifecycle.requestRewardedSkip();

  assert.equal(granted, false);
  assert.equal(lifecycle.inputSuspended, false);
});

test('requestRewardedSkip still restores audio and input even if the SDK rewardedBreak rejects', async () => {
  const { sdk } = makeRecordingSdk({
    async rewardedBreak(): Promise<boolean> {
      throw new Error('ad network unreachable');
    },
  });
  const { device } = createTraceAudioDevice();
  const executor = createAudioExecutor(device);
  const lifecycle = createPortalLifecycle(sdk, executor);

  await assert.rejects(() => lifecycle.requestRewardedSkip());
  assert.equal(lifecycle.inputSuspended, false, 'a rejected rewarded break must not leave input permanently suspended');
  assert.equal(executor.muted, false, 'a rejected rewarded break must not leave audio permanently muted');
});

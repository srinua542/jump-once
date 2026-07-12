/**
 * WebAudioDevice — the real `AudioContext` binding for the `AudioDevice`
 * seam (render/audio/AudioDevice.ts, S11.2, dm-0086/dm-0121). Construction
 * only: forwards each method to the real WebAudio graph.
 *
 * `createNoiseSource` needs a noise BUFFER (WebAudio has no native "noise
 * oscillator" type). `Math.random` is forbidden everywhere in render/ with
 * NO `platform/` exemption — RenderIsolation.test.ts's axiom scan applies
 * unconditionally to every render/ file, platform/ included ("visual RNG
 * is a seeded generator hashed off entity identity"). A one-time,
 * module-load noise buffer is therefore filled with `src/core/Rng`'s
 * deterministic `mulberry32` generator at a fixed literal seed —
 * statistically indistinguishable white noise for SFX purposes, zero
 * wall-clock/Math.random entropy, and reused (never regenerated) across
 * every `createNoiseSource` call. Every gain node routes through one
 * master `GainNode` (never straight to `ctx.destination`) so
 * `setMasterGain` genuinely controls overall output volume, including the
 * Poki ad-break silence requirement.
 */

import { createRng, nextFloat, type RngState } from '../../src/core/Rng';
import type { AudioDevice, GainHandle, NoiseHandle, OscillatorHandle, OscillatorWaveform } from '../audio/AudioDevice';

const NOISE_BUFFER_SEED = 0x9e3779b9;
const NOISE_BUFFER_SECONDS = 2;

function fillNoiseSamples(sampleRate: number): Float32Array<ArrayBuffer> {
  const length = Math.round(sampleRate * NOISE_BUFFER_SECONDS);
  const samples = new Float32Array(length);
  let rng: RngState = createRng(NOISE_BUFFER_SEED);
  for (let i = 0; i < length; i++) {
    const draw = nextFloat(rng);
    rng = draw.next;
    samples[i] = draw.value * 2 - 1;
  }
  return samples;
}

export function createWebAudioDevice(ctx: AudioContext): AudioDevice {
  const noiseBuffer = ctx.createBuffer(1, Math.round(ctx.sampleRate * NOISE_BUFFER_SECONDS), ctx.sampleRate);
  noiseBuffer.copyToChannel(fillNoiseSamples(ctx.sampleRate), 0);

  /* Every gain node routes through this single master gain, never directly
     to ctx.destination — the one real handle setMasterGain controls. */
  const masterGain = ctx.createGain();
  masterGain.gain.value = 1;
  masterGain.connect(ctx.destination);

  const oscillators = new Map<OscillatorHandle, OscillatorNode>();
  const noiseSources = new Map<NoiseHandle, AudioBufferSourceNode>();
  const gains = new Map<GainHandle, GainNode>();
  let nextHandle = 1;

  function sourceNode(handle: OscillatorHandle | NoiseHandle): AudioNode {
    const osc = oscillators.get(handle);
    if (osc !== undefined) return osc;
    const noise = noiseSources.get(handle);
    if (noise !== undefined) return noise;
    throw new Error(`WebAudioDevice: unknown source handle ${handle}`);
  }

  return {
    createOscillator(waveform: OscillatorWaveform): OscillatorHandle {
      const osc = ctx.createOscillator();
      osc.type = waveform;
      osc.start();
      const handle = nextHandle++;
      oscillators.set(handle, osc);
      return handle;
    },
    createNoiseSource(): NoiseHandle {
      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer;
      source.loop = true;
      source.start();
      const handle = nextHandle++;
      noiseSources.set(handle, source);
      return handle;
    },
    createGain(): GainHandle {
      const gain = ctx.createGain();
      const handle = nextHandle++;
      gains.set(handle, gain);
      return handle;
    },
    connectToGain(source, gain): void {
      const gainNode = gains.get(gain);
      if (gainNode === undefined) throw new Error(`WebAudioDevice: unknown gain handle ${gain}`);
      sourceNode(source).connect(gainNode);
    },
    connectGainToMaster(gain): void {
      const gainNode = gains.get(gain);
      if (gainNode === undefined) throw new Error(`WebAudioDevice: unknown gain handle ${gain}`);
      gainNode.connect(masterGain);
    },
    setFrequencyRamp(oscillator, startHz, endHz, durationSeconds): void {
      const osc = oscillators.get(oscillator);
      if (osc === undefined) throw new Error(`WebAudioDevice: unknown oscillator handle ${oscillator}`);
      const now = ctx.currentTime;
      osc.frequency.setValueAtTime(startHz, now);
      osc.frequency.linearRampToValueAtTime(endHz, now + durationSeconds);
    },
    setGainEnvelope(gain, peak, attackSeconds, releaseSeconds, durationSeconds): void {
      const gainNode = gains.get(gain);
      if (gainNode === undefined) throw new Error(`WebAudioDevice: unknown gain handle ${gain}`);
      const now = ctx.currentTime;
      const releaseStart = Math.max(attackSeconds, durationSeconds - releaseSeconds);
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(peak, now + attackSeconds);
      gainNode.gain.setValueAtTime(peak, now + releaseStart);
      gainNode.gain.linearRampToValueAtTime(0, now + durationSeconds);
    },
    start(source, durationSeconds): void {
      const node = sourceNode(source) as OscillatorNode | AudioBufferSourceNode;
      node.stop(ctx.currentTime + durationSeconds);
    },
    setMasterGain(value: number): void {
      masterGain.gain.setValueAtTime(value, ctx.currentTime);
    },
  };
}

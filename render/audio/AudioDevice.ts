/**
 * AudioDevice — the minimal, enumerated WebAudio device seam (S9.6,
 * dm-0086). A closed subset of the real `AudioContext`/`OscillatorNode`/
 * `GainNode`/`AudioBufferSourceNode` surface — exactly what `PatchCompiler`
 * uses to turn a `SynthPatch` (StylePack.ts, S9.1/S9.2) into scheduled
 * sound. Never the real DOM type outside render/platform/
 * (RenderIsolation.test.ts forbids naming `AudioContext` elsewhere).
 *
 * `start(source, durationSeconds)` schedules relative to "now" in whatever
 * time base the binding uses — this module never reads wall-clock time
 * itself (dm-0082); render/platform/ (S9.8) is where a real `AudioContext`
 * and its `currentTime` enter the picture.
 *
 * `createTraceAudioDevice` is a pure in-memory recorder — never touches a
 * real audio graph — used by every render/audio/ structural test.
 */

export type OscillatorHandle = number;
export type NoiseHandle = number;
export type GainHandle = number;

export type OscillatorWaveform = 'sine' | 'square' | 'triangle' | 'sawtooth';

export interface AudioDevice {
  createOscillator(waveform: OscillatorWaveform): OscillatorHandle;
  createNoiseSource(): NoiseHandle;
  createGain(): GainHandle;
  connectToGain(source: OscillatorHandle | NoiseHandle, gain: GainHandle): void;
  connectGainToMaster(gain: GainHandle): void;
  /** Linear frequency ramp from `startHz` to `endHz` over `durationSeconds`. Oscillators only. */
  setFrequencyRamp(oscillator: OscillatorHandle, startHz: number, endHz: number, durationSeconds: number): void;
  /** Attack/release gain envelope peaking at `peak`, total scheduled length `durationSeconds`. */
  setGainEnvelope(gain: GainHandle, peak: number, attackSeconds: number, releaseSeconds: number, durationSeconds: number): void;
  /** Start a source now, stopping it after `durationSeconds`. */
  start(source: OscillatorHandle | NoiseHandle, durationSeconds: number): void;
  /** 0 = silent (the Poki ad-break requirement), 1 = normal. */
  setMasterGain(value: number): void;
}

export function createTraceAudioDevice(): { readonly device: AudioDevice; trace(): readonly string[] } {
  const lines: string[] = [];
  let nextHandle = 1;
  const record = (name: string, args: readonly unknown[]): void => {
    lines.push(`${name}(${args.map((a) => JSON.stringify(a)).join(',')})`);
  };
  const device: AudioDevice = {
    createOscillator(waveform) {
      record('createOscillator', [waveform]);
      return nextHandle++;
    },
    createNoiseSource() {
      record('createNoiseSource', []);
      return nextHandle++;
    },
    createGain() {
      record('createGain', []);
      return nextHandle++;
    },
    connectToGain(source, gain) {
      record('connectToGain', [source, gain]);
    },
    connectGainToMaster(gain) {
      record('connectGainToMaster', [gain]);
    },
    setFrequencyRamp(oscillator, startHz, endHz, durationSeconds) {
      record('setFrequencyRamp', [oscillator, startHz, endHz, durationSeconds]);
    },
    setGainEnvelope(gain, peak, attackSeconds, releaseSeconds, durationSeconds) {
      record('setGainEnvelope', [gain, peak, attackSeconds, releaseSeconds, durationSeconds]);
    },
    start(source, durationSeconds) {
      record('start', [source, durationSeconds]);
    },
    setMasterGain(value) {
      record('setMasterGain', [value]);
    },
  };
  return { device, trace: () => lines };
}

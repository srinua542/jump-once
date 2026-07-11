/**
 * PatchCompiler — turns a category's procedural `SynthPatch` (StylePack.ts,
 * data authored at S9.2 in `PaperStylePack`'s `AUDIO_PATCH` table) into a
 * concrete `AudioDevice` node-graph plan (S9.6). Pure orchestration: no
 * branching on wall-clock time, no randomness — the exact same patch always
 * compiles to the exact same call sequence.
 *
 * Node graph: `oscillator|noise → gain → master`. The gain node carries the
 * patch's attack/release envelope; the oscillator (or noise source) carries
 * the frequency ramp (oscillators only — a noise source has no pitch).
 */

import type { SynthPatch } from '../style/StylePack';
import type { AudioDevice } from './AudioDevice';

export function compilePatch(patch: SynthPatch, device: AudioDevice): void {
  const gain = device.createGain();
  device.connectGainToMaster(gain);
  device.setGainEnvelope(gain, patch.gainPeak, patch.attackSeconds, patch.releaseSeconds, patch.durationSeconds);

  if (patch.waveform === 'noise') {
    const source = device.createNoiseSource();
    device.connectToGain(source, gain);
    device.start(source, patch.durationSeconds);
  } else {
    const oscillator = device.createOscillator(patch.waveform);
    device.connectToGain(oscillator, gain);
    device.setFrequencyRamp(oscillator, patch.freqStartHz, patch.freqEndHz, patch.durationSeconds);
    device.start(oscillator, patch.durationSeconds);
  }
}

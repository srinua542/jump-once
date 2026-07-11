/**
 * GlRenderer — replays a batch list against a Gl2Device (S9.4). Exactly one
 * `uploadBufferData` + `drawInstanced` pair per batch (i.e., per atlas
 * page touched this frame) — the instanced-batching win Batcher set up.
 * Each instance's transform (world position + atlas UV rect) is packed into
 * a flat `Float32Array`; the exact vertex-shader layout is a render/platform/
 * concern (S9.8) — this module only proves the RIGHT data reaches the RIGHT
 * device calls in the RIGHT order.
 */

import type { Batch } from './Batcher';
import type { Gl2Device, TextureHandle } from './Gl2Device';

/** Floats per instance: worldX, worldY, regionX, regionY, regionW, regionH. */
export const FLOATS_PER_INSTANCE = 6;

export function packInstanceFloats(batch: Batch): Float32Array {
  const floats = new Float32Array(batch.instances.length * FLOATS_PER_INSTANCE);
  batch.instances.forEach((instance, i) => {
    const base = i * FLOATS_PER_INSTANCE;
    floats[base + 0] = instance.worldX;
    floats[base + 1] = instance.worldY;
    floats[base + 2] = instance.regionX;
    floats[base + 3] = instance.regionY;
    floats[base + 4] = instance.regionW;
    floats[base + 5] = instance.regionH;
  });
  return floats;
}

/**
 * Draw every batch: one buffer upload + one instanced draw call per page.
 * `pageTexture` resolves a batch's page index to its GPU texture (from
 * `Atlas.pageTexture`); a batch whose page has no texture yet is skipped
 * (defensive — cannot happen if the same Atlas produced both the batches
 * and the texture lookup, asserted by S9.4's tests).
 */
export function drawBatches(batches: readonly Batch[], device: Gl2Device, pageTexture: (page: number) => TextureHandle | null): void {
  for (const batch of batches) {
    const texture = pageTexture(batch.page);
    if (texture === null) continue;
    const floats = packInstanceFloats(batch);
    const buffer = device.createBuffer();
    device.uploadBufferData(buffer, floats);
    device.drawInstanced(texture, buffer, batch.instances.length);
  }
}

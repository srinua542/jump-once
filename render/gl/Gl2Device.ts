/**
 * Gl2Device — the minimal, enumerated WebGL2 device seam (S9.4, dm-0086).
 * A closed subset of `WebGL2RenderingContext` — exactly what the atlas,
 * batcher, and executor use — never the real DOM type outside
 * render/platform/ (RenderIsolation.test.ts forbids naming it elsewhere).
 * Extending this interface means enumerating and documenting the new member.
 *
 * `TextureHandle`/`BufferHandle` are opaque numeric ids here; the real
 * render/platform/ binding (S9.8) maps them onto actual `WebGLTexture`/
 * `WebGLBuffer` objects. `createTraceGl2Device` is a pure in-memory
 * recording implementation — never touches a GPU — used by every
 * render/gl/ structural test and by nothing else.
 */

export type TextureHandle = number;
export type BufferHandle = number;

/** A raw RGBA pixel rectangle — the result of rasterizing a StylePack bitmap. */
export interface PixelData {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
}

export interface Gl2Device {
  /** Allocate a blank RGBA texture of the given page size. */
  createTexture(widthPx: number, heightPx: number): TextureHandle;
  /** Upload (texSubImage2D-style) a pixel rectangle into an existing texture at (x, y). */
  uploadTextureRegion(texture: TextureHandle, x: number, y: number, pixels: PixelData): void;
  createBuffer(): BufferHandle;
  /** Upload instance-transform floats into a buffer (STATIC/DYNAMIC draw usage is a platform-binding detail). */
  uploadBufferData(buffer: BufferHandle, floats: Float32Array): void;
  /** One instanced draw call: `instanceCount` quads textured from `texture`, transformed by `instanceBuffer`. */
  drawInstanced(texture: TextureHandle, instanceBuffer: BufferHandle, instanceCount: number): void;
}

/** A trivial, deterministic "rasterizer" for headless tests: a solid-colour rectangle of the requested size. No real pixels are ever inspected — only dimensions and call counts matter structurally. */
export function fakePixelData(width: number, height: number): PixelData {
  return { width, height, rgba: new Uint8ClampedArray(Math.max(0, Math.round(width) * Math.round(height) * 4)) };
}

export function createTraceGl2Device(): { readonly device: Gl2Device; trace(): readonly string[] } {
  const lines: string[] = [];
  let nextTexture = 1;
  let nextBuffer = 1;
  const record = (name: string, args: readonly unknown[]): void => {
    lines.push(`${name}(${args.map((a) => JSON.stringify(a)).join(',')})`);
  };
  const device: Gl2Device = {
    createTexture(widthPx, heightPx) {
      record('createTexture', [widthPx, heightPx]);
      return nextTexture++;
    },
    uploadTextureRegion(texture, x, y, pixels) {
      record('uploadTextureRegion', [texture, x, y, pixels.width, pixels.height]);
    },
    createBuffer() {
      record('createBuffer', []);
      return nextBuffer++;
    },
    uploadBufferData(buffer, floats) {
      record('uploadBufferData', [buffer, floats.length]);
    },
    drawInstanced(texture, instanceBuffer, instanceCount) {
      record('drawInstanced', [texture, instanceBuffer, instanceCount]);
    },
  };
  return { device, trace: () => lines };
}

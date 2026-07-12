/**
 * WebGl2Device — the real WebGL2 binding for the `Gl2Device` seam
 * (render/gl/Gl2Device.ts, S11.2, dm-0086/dm-0121). Implements the FOUR
 * documented device calls (`createTexture`/`uploadTextureRegion`/
 * `createBuffer`/`uploadBufferData`) plus `drawInstanced` exactly as
 * `render/gl/GlRenderer.ts`/`Batcher.ts` already call them — those modules
 * are untouched (dm-0119's fix already made their buffer lifecycle
 * correct; no further signature change here).
 *
 * Camera/canvas-size projection (the one piece P9 left unbuilt: nothing in
 * the previously-existing render/gl/ or render/scene/ modules ever applied
 * a camera transform to a world-space instance position — `compileScene`'s
 * own docstring says "the caller (the shell) owns the world-to-screen
 * ratio") is intentionally kept OUT of the `Gl2Device` interface (adding a
 * projection parameter to `drawInstanced` would be a breaking signature
 * change to already-VERIFIED, already-tested P9 code for a concern that is
 * fundamentally a GPU/shader concern). Instead `setProjection` is an
 * EXTRA method on the concrete `WebGl2Device` object (not part of the
 * `Gl2Device` interface) that `Main.ts` calls once per frame before
 * `drawBatches` — the vertex shader below reads it as a uniform. World
 * positions and atlas regions still reach the GPU exactly as
 * `packInstanceFloats` already packs them (6 floats: worldX, worldY,
 * regionX, regionY, regionW, regionH) — unchanged.
 *
 * Convention this binding requires of its caller (documented, not
 * enforced in code — there is no compiler for it): `tileSizePx` passed to
 * `compileScene` must equal `pixelsPerWorldUnit * levelTileSize`
 * (`pixelsPerWorldUnit = canvasWidthPx / (viewportHalfWidth * 2)`), so a
 * rasterized sprite's pixel size already matches the camera's current
 * zoom — the shader below scales instance ORIGIN by the camera transform
 * but draws each quad at its already-correctly-sized `regionSize`
 * verbatim, never re-scaling it. `Main.ts` computes this each frame.
 */

import type { BufferHandle, Gl2Device, PixelData, TextureHandle } from '../gl/Gl2Device';

export interface Gl2Projection {
  readonly cameraX: number;
  readonly cameraY: number;
  readonly viewportHalfWidth: number;
  readonly viewportHalfHeight: number;
  readonly canvasWidthPx: number;
  readonly canvasHeightPx: number;
  readonly atlasPageSizePx: number;
  /**
   * Pixels-per-world-unit the bitmaps in this frame's batches were
   * RASTERIZED at (i.e. `GameShell`'s fixed `tileSizePx` divided by the
   * level's `tilemap.tileSize`) — a caching-stable constant chosen once
   * per level load, deliberately independent of the live canvas size
   * (dm-0080: "generate never per-frame", extended here to "never
   * per-resize"). The CURRENT on-screen pixels-per-world-unit
   * (`canvasSizePx / (viewportHalfExtents * 2)`) is usually different
   * (canvas resizes constantly; rasterized bitmaps do not) — the shader
   * scales each quad's SIZE by the ratio of the two, while its ORIGIN
   * scales by the current ratio directly. Without this, either sprites
   * would re-rasterize every resize (expensive, defeats the atlas cache)
   * or would render at the wrong physical size relative to the world grid.
   */
  readonly referencePixelsPerWorldUnit: number;
}

export interface WebGl2Device extends Gl2Device {
  setProjection(projection: Gl2Projection): void;
}

const VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec2 a_worldPos;
layout(location = 2) in vec2 a_regionOrigin;
layout(location = 3) in vec2 a_regionSize;

uniform vec2 u_cameraPos;
uniform vec2 u_viewportHalfExtents;
uniform vec2 u_canvasSizePx;
uniform float u_atlasPageSizePx;
uniform float u_referencePixelsPerWorldUnit;

out vec2 v_uv;

void main() {
  vec2 pixelsPerWorldUnit = u_canvasSizePx / (u_viewportHalfExtents * 2.0);
  vec2 topLeftWorld = u_cameraPos - u_viewportHalfExtents;
  vec2 screenTopLeftPx = (a_worldPos - topLeftWorld) * pixelsPerWorldUnit;
  /* a_regionSize was rasterized at u_referencePixelsPerWorldUnit — rescale
     to the CURRENT pixels-per-world-unit so a resize scales sprites
     without re-rasterizing them (dm-0080 extended to resize). */
  float spriteScale = pixelsPerWorldUnit.x / u_referencePixelsPerWorldUnit;
  vec2 screenPx = screenTopLeftPx + a_corner * a_regionSize * spriteScale;

  vec2 ndc = vec2(
    screenPx.x / u_canvasSizePx.x * 2.0 - 1.0,
    1.0 - screenPx.y / u_canvasSizePx.y * 2.0
  );
  gl_Position = vec4(ndc, 0.0, 1.0);

  v_uv = (a_regionOrigin + a_corner * a_regionSize) / u_atlasPageSizePx;
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_atlas;
out vec4 outColor;
void main() {
  outColor = texture(u_atlas, v_uv);
}
`;

/* Unit quad, drawn as a TRIANGLE_STRIP: (0,0) (1,0) (0,1) (1,1). */
const QUAD_CORNERS = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (shader === null) throw new Error('WebGl2Device: createShader failed');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`WebGl2Device: shader compile failed: ${log ?? 'unknown error'}`);
  }
  return shader;
}

function linkProgram(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (program === null) throw new Error('WebGl2Device: createProgram failed');
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`WebGl2Device: program link failed: ${log ?? 'unknown error'}`);
  }
  return program;
}

export function createWebGl2Device(gl: WebGL2RenderingContext): WebGl2Device {
  const program = linkProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
  const u_cameraPos = gl.getUniformLocation(program, 'u_cameraPos');
  const u_viewportHalfExtents = gl.getUniformLocation(program, 'u_viewportHalfExtents');
  const u_canvasSizePx = gl.getUniformLocation(program, 'u_canvasSizePx');
  const u_atlasPageSizePx = gl.getUniformLocation(program, 'u_atlasPageSizePx');
  const u_referencePixelsPerWorldUnit = gl.getUniformLocation(program, 'u_referencePixelsPerWorldUnit');
  const u_atlas = gl.getUniformLocation(program, 'u_atlas');

  const quadBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, QUAD_CORNERS, gl.STATIC_DRAW);

  const textures = new Map<TextureHandle, WebGLTexture>();
  const buffers = new Map<BufferHandle, WebGLBuffer>();
  const vaos = new Map<BufferHandle, WebGLVertexArrayObject>();
  let nextTexture = 1;
  let nextBuffer = 1;
  let projection: Gl2Projection | null = null;

  function ensureVao(bufferHandle: BufferHandle, glBuffer: WebGLBuffer): WebGLVertexArrayObject {
    const existing = vaos.get(bufferHandle);
    if (existing !== undefined) return existing;

    const vao = gl.createVertexArray();
    if (vao === null) throw new Error('WebGl2Device: createVertexArray failed');
    gl.bindVertexArray(vao);

    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const stride = 6 * Float32Array.BYTES_PER_ELEMENT;
    gl.bindBuffer(gl.ARRAY_BUFFER, glBuffer);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT);
    gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 4 * Float32Array.BYTES_PER_ELEMENT);
    gl.vertexAttribDivisor(3, 1);

    gl.bindVertexArray(null);
    vaos.set(bufferHandle, vao);
    return vao;
  }

  return {
    createTexture(widthPx: number, heightPx: number): TextureHandle {
      const texture = gl.createTexture();
      if (texture === null) throw new Error('WebGl2Device: createTexture failed');
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, widthPx, heightPx, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const handle = nextTexture++;
      textures.set(handle, texture);
      return handle;
    },
    uploadTextureRegion(texture: TextureHandle, x: number, y: number, pixels: PixelData): void {
      const glTexture = textures.get(texture);
      if (glTexture === undefined) throw new Error(`WebGl2Device: unknown texture handle ${texture}`);
      gl.bindTexture(gl.TEXTURE_2D, glTexture);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, pixels.width, pixels.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels.rgba);
    },
    createBuffer(): BufferHandle {
      const buffer = gl.createBuffer();
      if (buffer === null) throw new Error('WebGl2Device: createBuffer failed');
      const handle = nextBuffer++;
      buffers.set(handle, buffer);
      return handle;
    },
    uploadBufferData(buffer: BufferHandle, floats: Float32Array): void {
      const glBuffer = buffers.get(buffer);
      if (glBuffer === undefined) throw new Error(`WebGl2Device: unknown buffer handle ${buffer}`);
      gl.bindBuffer(gl.ARRAY_BUFFER, glBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, floats, gl.DYNAMIC_DRAW);
    },
    drawInstanced(texture: TextureHandle, instanceBuffer: BufferHandle, instanceCount: number): void {
      const glTexture = textures.get(texture);
      const glBuffer = buffers.get(instanceBuffer);
      if (glTexture === undefined) throw new Error(`WebGl2Device: unknown texture handle ${texture}`);
      if (glBuffer === undefined) throw new Error(`WebGl2Device: unknown buffer handle ${instanceBuffer}`);
      if (projection === null) throw new Error('WebGl2Device: drawInstanced called before setProjection');

      gl.useProgram(program);
      gl.uniform2f(u_cameraPos, projection.cameraX, projection.cameraY);
      gl.uniform2f(u_viewportHalfExtents, projection.viewportHalfWidth, projection.viewportHalfHeight);
      gl.uniform2f(u_canvasSizePx, projection.canvasWidthPx, projection.canvasHeightPx);
      gl.uniform1f(u_atlasPageSizePx, projection.atlasPageSizePx);
      gl.uniform1f(u_referencePixelsPerWorldUnit, projection.referencePixelsPerWorldUnit);
      gl.uniform1i(u_atlas, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, glTexture);

      const vao = ensureVao(instanceBuffer, glBuffer);
      gl.bindVertexArray(vao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, instanceCount);
      gl.bindVertexArray(null);
    },
    setProjection(next: Gl2Projection): void {
      projection = next;
    },
  };
}

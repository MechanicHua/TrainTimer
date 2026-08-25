const vertexShaderSource = `
  attribute vec2 a_position;
  varying vec2 v_uv;

  void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const downsampleShaderSource = `
  precision mediump float;
  uniform sampler2D u_texture;
  uniform vec2 u_texelSize;
  uniform float u_offset;
  varying vec2 v_uv;

  void main() {
    vec2 offset = u_texelSize * u_offset;
    vec4 color = texture2D(u_texture, v_uv) * 4.0;
    color += texture2D(u_texture, v_uv + vec2(-offset.x, -offset.y));
    color += texture2D(u_texture, v_uv + vec2(offset.x, -offset.y));
    color += texture2D(u_texture, v_uv + vec2(-offset.x, offset.y));
    color += texture2D(u_texture, v_uv + vec2(offset.x, offset.y));
    gl_FragColor = color / 8.0;
  }
`;

const upsampleShaderSource = `
  precision mediump float;
  uniform sampler2D u_texture;
  uniform vec2 u_texelSize;
  uniform float u_offset;
  varying vec2 v_uv;

  void main() {
    vec2 offset = u_texelSize * u_offset;
    vec4 color = vec4(0.0);
    color += texture2D(u_texture, v_uv + vec2(-2.0 * offset.x, 0.0));
    color += texture2D(u_texture, v_uv + vec2(-offset.x, offset.y)) * 2.0;
    color += texture2D(u_texture, v_uv + vec2(0.0, 2.0 * offset.y));
    color += texture2D(u_texture, v_uv + vec2(offset.x, offset.y)) * 2.0;
    color += texture2D(u_texture, v_uv + vec2(2.0 * offset.x, 0.0));
    color += texture2D(u_texture, v_uv + vec2(offset.x, -offset.y)) * 2.0;
    color += texture2D(u_texture, v_uv + vec2(0.0, -2.0 * offset.y));
    color += texture2D(u_texture, v_uv + vec2(-offset.x, -offset.y)) * 2.0;
    gl_FragColor = color / 12.0;
  }
`;

export function createDualKawaseTextBlurPrecomputer(options = {}) {
  const maxPixelRatio = Math.max(0.75, Number(options.maxPixelRatio) || 1.25);
  const blurOffset = Math.max(0.5, Number(options.blurOffset) || 0.85);
  let workerClient = null;
  let workerUnavailable = false;
  let renderer = null;
  let state = 'cold';
  let backend = '';

  return {
    async precompute(element) {
      const raster = rasterizeTextElement(element, { maxPixelRatio });
      if (!raster) {
        state = 'empty';
        return null;
      }

      let blurredSource = null;
      if (!workerUnavailable) {
        if (!workerClient) workerClient = createDualKawaseWorkerClient();
        if (workerClient) {
          try {
            state = 'computing-worker';
            blurredSource = await workerClient.blur(raster.canvas, blurOffset);
            backend = 'worker-webgl';
          } catch {
            workerClient.destroy();
            workerClient = null;
            workerUnavailable = true;
          }
        } else {
          workerUnavailable = true;
        }
      }

      if (!blurredSource) {
        if (!renderer) renderer = createDualKawaseBlurRenderer(document.createElement('canvas'));
        if (!renderer) {
          state = 'unavailable';
          return null;
        }
        state = 'computing-main';
        blurredSource = renderer.blur(raster.canvas, blurOffset);
        backend = 'main-webgl';
      }

      const canvas = copyBlurredSourceToCanvas(blurredSource, raster.canvas.width, raster.canvas.height);
      blurredSource?.close?.();
      if (!canvas) {
        state = 'failed';
        return null;
      }
      state = 'ready';
      return {
        canvas,
        cssWidth: raster.cssWidth,
        cssHeight: raster.cssHeight,
        pixelRatio: raster.pixelRatio,
      };
    },
    get rendererReady() {
      return Boolean(workerClient || renderer);
    },
    get state() {
      return state;
    },
    get backend() {
      return backend;
    },
  };
}

function createDualKawaseWorkerClient() {
  if (
    typeof Worker !== 'function'
    || typeof OffscreenCanvas !== 'function'
    || typeof createImageBitmap !== 'function'
  ) return null;
  const worker = new Worker(
    new URL('./scramble-blur-worker.js?v=20260823-dual-kawase-worker-v42', import.meta.url),
    { type: 'module', name: 'scramble-dual-kawase' },
  );
  const pending = new Map();
  let requestId = 0;
  let destroyed = false;

  const rejectPending = (error) => {
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
  };
  worker.addEventListener('message', (event) => {
    const entry = pending.get(event.data?.id);
    if (!entry) return;
    pending.delete(event.data.id);
    if (event.data.error || !event.data.bitmap) {
      entry.reject(new Error(event.data.error || 'Dual Kawase worker returned no bitmap'));
      return;
    }
    entry.resolve(event.data.bitmap);
  });
  worker.addEventListener('error', () => {
    destroyed = true;
    rejectPending(new Error('Dual Kawase worker failed'));
  });

  return {
    async blur(sourceCanvas, offset) {
      if (destroyed) throw new Error('Dual Kawase worker is unavailable');
      const bitmap = await createImageBitmap(sourceCanvas);
      const id = ++requestId;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, bitmap, offset }, [bitmap]);
      });
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      worker.terminate();
      rejectPending(new Error('Dual Kawase worker terminated'));
    },
  };
}

function copyBlurredSourceToCanvas(source, width, height) {
  if (!source) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) return null;
  context.drawImage(source, 0, 0, width, height);
  return canvas;
}

function rasterizeTextElement(element, options = {}) {
  if (!(element instanceof HTMLElement) || !element.isConnected) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const maxPixelRatio = Math.max(0.75, Number(options.maxPixelRatio) || 1.25);
  const pixelRatio = Math.min(maxPixelRatio, Math.max(1, window.devicePixelRatio || 1));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(rect.width * pixelRatio));
  canvas.height = Math.max(1, Math.ceil(rect.height * pixelRatio));
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) return null;
  context.scale(pixelRatio, pixelRatio);
  context.textBaseline = 'alphabetic';

  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const styleCache = new WeakMap();
  const range = document.createRange();
  let node = walker.nextNode();
  while (node) {
    const text = node.nodeValue || '';
    const tokenPattern = /\S+/g;
    let match = tokenPattern.exec(text);
    while (match) {
      range.setStart(node, match.index);
      range.setEnd(node, match.index + match[0].length);
      const tokenRect = range.getBoundingClientRect();
      if (tokenRect.width > 0 && tokenRect.height > 0) {
        const parent = node.parentElement || element;
        let style = styleCache.get(parent);
        if (!style) {
          style = getComputedStyle(parent);
          styleCache.set(parent, style);
        }
        if (style.visibility !== 'hidden' && style.display !== 'none') {
          context.font = canvasFontFromStyle(style);
          context.fillStyle = style.color;
          context.globalAlpha = normalizedOpacity(style.opacity);
          const metrics = context.measureText(match[0]);
          const fontSize = Number.parseFloat(style.fontSize) || 16;
          const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.8;
          const descent = metrics.actualBoundingBoxDescent || fontSize * 0.2;
          const baseline = tokenRect.top - rect.top
            + Math.max(0, (tokenRect.height - ascent - descent) / 2)
            + ascent;
          context.fillText(match[0], tokenRect.left - rect.left, baseline);
        }
      }
      match = tokenPattern.exec(text);
    }
    node = walker.nextNode();
  }
  range.detach?.();
  context.globalAlpha = 1;

  return {
    canvas,
    cssWidth: rect.width,
    cssHeight: rect.height,
    pixelRatio,
  };
}

function canvasFontFromStyle(style) {
  if (style.font && style.font !== '') return style.font;
  return [
    style.fontStyle || 'normal',
    style.fontVariant || 'normal',
    style.fontWeight || '400',
    style.fontSize || '16px',
    style.fontFamily || 'sans-serif',
  ].join(' ');
}

function normalizedOpacity(value) {
  const opacity = Number.parseFloat(value);
  return Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : 1;
}

export function createDualKawaseBlurRenderer(canvas) {
  if (!canvas?.getContext) return null;
  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: true,
    powerPreference: 'low-power',
  });
  if (!gl) return null;

  const downsampleProgram = createProgramInfo(gl, vertexShaderSource, downsampleShaderSource);
  const upsampleProgram = createProgramInfo(gl, vertexShaderSource, upsampleShaderSource);
  if (!downsampleProgram || !upsampleProgram) return null;
  const positionBuffer = gl.createBuffer();
  if (!positionBuffer) return null;
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,
    1, -1,
    -1, 1,
    1, 1,
  ]), gl.STATIC_DRAW);
  gl.disable(gl.BLEND);
  gl.disable(gl.DEPTH_TEST);
  gl.clearColor(0, 0, 0, 0);

  return {
    blur(sourceCanvas, offset) {
      if (!sourceCanvas || gl.isContextLost()) return null;
      const width = Number(sourceCanvas.width) || 0;
      const height = Number(sourceCanvas.height) || 0;
      const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      if (width <= 0 || height <= 0 || width > maxTextureSize || height > maxTextureSize) return null;
      canvas.width = width;
      canvas.height = height;

      const sourceTexture = createTexture(gl, width, height, sourceCanvas);
      const half = createRenderTarget(gl, Math.max(1, Math.floor(width / 2)), Math.max(1, Math.floor(height / 2)));
      const quarter = createRenderTarget(gl, Math.max(1, Math.floor(width / 4)), Math.max(1, Math.floor(height / 4)));
      const expandedHalf = createRenderTarget(gl, half?.width || 1, half?.height || 1);
      if (!sourceTexture || !half || !quarter || !expandedHalf) {
        deleteTexture(gl, sourceTexture);
        deleteRenderTarget(gl, half);
        deleteRenderTarget(gl, quarter);
        deleteRenderTarget(gl, expandedHalf);
        return null;
      }

      drawPass(gl, positionBuffer, downsampleProgram, sourceTexture, width, height, half, offset);
      drawPass(gl, positionBuffer, downsampleProgram, half.texture, half.width, half.height, quarter, offset);
      drawPass(gl, positionBuffer, upsampleProgram, quarter.texture, quarter.width, quarter.height, expandedHalf, offset);
      drawPass(gl, positionBuffer, upsampleProgram, expandedHalf.texture, expandedHalf.width, expandedHalf.height, {
        framebuffer: null,
        width,
        height,
      }, offset);

      deleteTexture(gl, sourceTexture);
      deleteRenderTarget(gl, half);
      deleteRenderTarget(gl, quarter);
      deleteRenderTarget(gl, expandedHalf);
      return canvas;
    },
  };
}

function createProgramInfo(gl, vertexSource, fragmentSource) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertexShader || !fragmentShader) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  return {
    program,
    position: gl.getAttribLocation(program, 'a_position'),
    texture: gl.getUniformLocation(program, 'u_texture'),
    texelSize: gl.getUniformLocation(program, 'u_texelSize'),
    offset: gl.getUniformLocation(program, 'u_offset'),
  };
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createTexture(gl, width, height, source = null) {
  const texture = gl.createTexture();
  if (!texture) return null;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (source) {
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }
  return texture;
}

function createRenderTarget(gl, width, height) {
  const texture = createTexture(gl, width, height);
  const framebuffer = gl.createFramebuffer();
  if (!texture || !framebuffer) {
    deleteTexture(gl, texture);
    if (framebuffer) gl.deleteFramebuffer(framebuffer);
    return null;
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    gl.deleteFramebuffer(framebuffer);
    gl.deleteTexture(texture);
    return null;
  }
  return { texture, framebuffer, width, height };
}

function drawPass(gl, positionBuffer, info, texture, textureWidth, textureHeight, target, offset) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
  gl.viewport(0, 0, target.width, target.height);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(info.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.enableVertexAttribArray(info.position);
  gl.vertexAttribPointer(info.position, 2, gl.FLOAT, false, 0, 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.uniform1i(info.texture, 0);
  gl.uniform2f(info.texelSize, 1 / textureWidth, 1 / textureHeight);
  gl.uniform1f(info.offset, offset);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function deleteTexture(gl, texture) {
  if (texture) gl.deleteTexture(texture);
}

function deleteRenderTarget(gl, target) {
  if (!target) return;
  gl.deleteFramebuffer(target.framebuffer);
  gl.deleteTexture(target.texture);
}

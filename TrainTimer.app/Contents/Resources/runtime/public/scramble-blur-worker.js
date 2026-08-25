import { createDualKawaseBlurRenderer } from './scramble-blur.js?v=20260823-dual-kawase-worker-v42';

const renderCanvas = new OffscreenCanvas(1, 1);
const renderer = createDualKawaseBlurRenderer(renderCanvas);

self.addEventListener('message', (event) => {
  const { id, bitmap, offset } = event.data || {};
  if (!id || !bitmap) return;
  try {
    const result = renderer?.blur(bitmap, Number(offset) || 0.85);
    bitmap.close?.();
    if (!result) {
      self.postMessage({ id, error: 'Dual Kawase WebGL renderer is unavailable' });
      return;
    }
    const output = result.transferToImageBitmap();
    self.postMessage({ id, bitmap: output }, [output]);
  } catch (error) {
    bitmap.close?.();
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
});

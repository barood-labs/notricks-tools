// On-device background removal with BiRefNet (MIT) via transformers.js / onnxruntime-web.
// Loaded lazily; model weights are fetched once from the Hugging Face CDN and cached by the browser.
let TF, cache = {};
export const MODELS = {
  fast: { id: 'onnx-community/BiRefNet_lite-ONNX', mb: { fp16: 114, fp32: 224 } },
  best: { id: 'onnx-community/BiRefNet-ONNX', mb: { fp16: 489, fp32: 972 } },
};
let forceWasm = (() => { try { return localStorage.getItem('bg_nogpu') === '1'; } catch { return false; } })();
export const disableGpu = () => { forceWasm = true; try { localStorage.setItem('bg_nogpu', '1'); } catch {} };
export async function gpuInfo() { if (forceWasm) return { gpu: false }; try { const a = navigator.gpu && await navigator.gpu.requestAdapter(); // ONNX Runtime's WebGPU kernels for BiRefNet need >10 storage buffers per shader stage; weaker adapters use WASM.
  const ok = !!a && a.limits.maxStorageBuffersPerShaderStage > 10; return { gpu: ok, f16: ok && a.features.has('shader-f16') }; } catch { return { gpu: false }; } }
export async function plan(variant) { const { gpu, f16 } = await gpuInfo(); const dtype = gpu && f16 ? 'fp16' : 'fp32';
  // Full BiRefNet in fp32 needs ~1 GB download + several GB RAM; use the lite model unless fp16 WebGPU is available.
  const v = (dtype === 'fp32' && variant === 'best') ? 'fast' : variant; return { gpu, device: gpu ? 'webgpu' : 'wasm', dtype, variant: v, mb: MODELS[v].mb[dtype] }; }
export async function load(variant, onProgress) {
  const p = await plan(variant); const key = p.variant + p.device;
  if (cache[key]) return { ...p, ...cache[key] };
  TF = TF || await import('@huggingface/transformers');
  TF.env.allowLocalModels = false;
  const progress_callback = e => { if (e.status === 'progress' && onProgress && /onnx/.test(e.file)) onProgress(e.loaded, e.total); };
  let model;
  try { model = await TF.AutoModel.from_pretrained(MODELS[p.variant].id, { device: p.device, dtype: p.dtype, progress_callback }); }
  catch (e) { if (p.device !== 'webgpu') throw e; console.warn('WebGPU failed, falling back to WASM', e); forceWasm = true; return load(variant, onProgress); }
  const processor = await TF.AutoProcessor.from_pretrained(MODELS[p.variant].id);
  cache[key] = { model, processor }; return { ...p, model, processor };
}
// Returns a full-resolution alpha mask (Uint8ClampedArray, w*h) for the given canvas.
export async function segment(m, canvas) {
  const img = TF.RawImage.fromCanvas(canvas);
  const { pixel_values } = await m.processor(img);
  const { output_image } = await m.model({ input_image: pixel_values });
  const small = await TF.RawImage.fromTensor(output_image[0].sigmoid().mul(255).to('uint8'));
  // Upscale mask to the original size with smooth interpolation (keeps hair edges soft).
  const mc = document.createElement('canvas'); mc.width = small.width; mc.height = small.height;
  const id = new ImageData(small.width, small.height); for (let i = 0; i < small.data.length; i++) { id.data[i*4] = id.data[i*4+1] = id.data[i*4+2] = small.data[i]; id.data[i*4+3] = 255; }
  mc.getContext('2d').putImageData(id, 0, 0);
  const big = document.createElement('canvas'); big.width = canvas.width; big.height = canvas.height;
  const g = big.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(mc, 0, 0, big.width, big.height);
  const d = g.getImageData(0, 0, big.width, big.height).data, a = new Uint8ClampedArray(big.width * big.height);
  for (let i = 0; i < a.length; i++) a[i] = d[i*4];
  return a;
}

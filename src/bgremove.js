// On-device background removal. Two engines, both run locally in the browser:
//  - "fast": IS-Net general-use (Apache-2.0) via onnxruntime-web WASM. ~0.9 GB RAM; works on most phones and computers.
//  - "best": BiRefNet (MIT) via transformers.js on WebGPU. Needs a GPU; BiRefNet needs ~7 GB as CPU/WASM, so it is GPU-only.
let TF, ORT, cache = {};
let noGpu = (() => { try { return localStorage.getItem('bg_nogpu') === '1'; } catch { return false; } })();
export const disableGpu = () => { noGpu = true; try { localStorage.setItem('bg_nogpu', '1'); } catch {} };
const BIR = { full: { id: 'onnx-community/BiRefNet-ONNX', dtype: 'fp16', mb: 489 }, lite: { id: 'onnx-community/BiRefNet_lite-ONNX', dtype: 'fp32', mb: 224 } };
const ISNET = { parts: ['models/isnet/isnet-general-use.onnx.part0', 'models/isnet/isnet-general-use.onnx.part1'], bytes: 178648008, mb: 179 };
export async function gpuInfo() { if (noGpu) return { gpu: false }; try { const a = navigator.gpu && await navigator.gpu.requestAdapter();
  // ONNX Runtime's WebGPU kernels for BiRefNet need >10 storage buffers per shader stage.
  const ok = !!a && a.limits.maxStorageBuffersPerShaderStage > 10; return { gpu: ok, f16: ok && a.features.has('shader-f16') }; } catch { return { gpu: false }; } }
export async function plan(variant) { const { gpu, f16 } = await gpuInfo();
  if (variant === 'best' && gpu) { const b = f16 ? BIR.full : BIR.lite; return { engine: 'birefnet', gpu, variant: 'best', device: 'webgpu', ...b, label: f16 ? 'BiRefNet' : 'BiRefNet lite' }; }
  return { engine: 'isnet', gpu, variant: 'fast', device: 'wasm', mb: ISNET.mb, label: 'IS-Net', downgraded: variant === 'best' }; }
async function fetchCached(url, onBytes) { const c = 'caches' in self ? await caches.open('nt-models-v1') : null; let r = c && await c.match(url);
  if (!r) { r = await fetch(url); if (!r.ok) throw new Error('model download failed: ' + r.status); if (c) { try { await c.put(url, r.clone()); } catch {} } }
  const rd = r.body.getReader(), chunks = []; let n = 0; for (;;) { const { done, value } = await rd.read(); if (done) break; chunks.push(value); n += value.length; onBytes(value.length); }
  const out = new Uint8Array(n); let o = 0; for (const ch of chunks) { out.set(ch, o); o += ch.length; } return out; }
export async function load(variant, onProgress) {
  const p = await plan(variant), key = p.engine + p.device; if (cache[key]) return { ...p, ...cache[key] };
  if (p.engine === 'isnet') {
    ORT = ORT || await import('onnxruntime-web/wasm'); let got = 0; const tick = b => { got += b; onProgress && onProgress(got, ISNET.bytes); };
    const parts = []; for (const u of ISNET.parts) parts.push(await fetchCached(new URL(u, location.href).href, tick));
    const buf = new Uint8Array(parts.reduce((s, x) => s + x.length, 0)); let o = 0; for (const x of parts) { buf.set(x, o); o += x.length; }
    ORT.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
    const session = await ORT.InferenceSession.create(buf, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    cache[key] = { session }; return { ...p, session };
  }
  TF = TF || await import('@huggingface/transformers'); TF.env.allowLocalModels = false;
  const progress_callback = e => { if (e.status === 'progress' && onProgress && /onnx/.test(e.file)) onProgress(e.loaded, e.total); };
  const model = await TF.AutoModel.from_pretrained(p.id, { device: 'webgpu', dtype: p.dtype, progress_callback });
  const processor = await TF.AutoProcessor.from_pretrained(p.id);
  cache[key] = { model, processor }; return { ...p, model, processor };
}
const S = 1024;
function toInput(canvas, mean, std, maxNorm) { const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d', { willReadFrequently: true }); g.imageSmoothingQuality = 'high'; g.drawImage(canvas, 0, 0, S, S);
  const d = g.getImageData(0, 0, S, S).data, x = new Float32Array(3 * S * S); let mx = 1; if (maxNorm) { mx = 0; for (let i = 0; i < d.length; i += 4) mx = Math.max(mx, d[i], d[i+1], d[i+2]); mx = mx || 1; } else mx = 255;
  for (let i = 0, j = 0; i < d.length; i += 4, j++) for (let k = 0; k < 3; k++) x[k * S * S + j] = (d[i + k] / mx - mean[k]) / std[k]; return x; }
function upscale(small, w, h, W, H) { // small: Uint8 mask w*h → full-res Uint8 W*H (smooth bilinear via canvas)
  const mc = document.createElement('canvas'); mc.width = w; mc.height = h; const id = new ImageData(w, h); for (let i = 0; i < small.length; i++) { id.data[i*4] = small[i]; id.data[i*4+3] = 255; } mc.getContext('2d').putImageData(id, 0, 0);
  const big = document.createElement('canvas'); big.width = W; big.height = H; const g = big.getContext('2d', { willReadFrequently: true }); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(mc, 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H).data, a = new Uint8ClampedArray(W * H); for (let i = 0; i < a.length; i++) a[i] = d[i*4]; return a; }
// Returns a full-resolution alpha mask (Uint8ClampedArray, w*h) for the given canvas.
export async function segment(m, canvas) {
  if (m.engine === 'isnet') { const x = toInput(canvas, [0.5, 0.5, 0.5], [1, 1, 1], true);
    const out = await m.session.run({ [m.session.inputNames[0]]: new ORT.Tensor('float32', x, [1, 3, S, S]) }); const p = out[m.session.outputNames[0]].data;
    let mn = Infinity, mx = -Infinity; for (const v of p) { if (v < mn) mn = v; if (v > mx) mx = v; } const sm = new Uint8ClampedArray(S * S), r = 255 / ((mx - mn) || 1); for (let i = 0; i < sm.length; i++) sm[i] = (p[i] - mn) * r;
    return upscale(sm, S, S, canvas.width, canvas.height); }
  const img = TF.RawImage.fromCanvas(canvas); const { pixel_values } = await m.processor(img); const { output_image } = await m.model({ input_image: pixel_values });
  const small = await TF.RawImage.fromTensor(output_image[0].sigmoid().mul(255).to('uint8')); return upscale(small.data, small.width, small.height, canvas.width, canvas.height);
}

# Background remover QA (2026-10-19, America/Boise)
Automated: `qa/bg.mjs` (Playwright, headless Chrome, local preview). 4 runs: en desktop, ar mobile (390px, RTL), es desktop, en mobile. **All checks passed (en_desktop 31/31, then 93/93 for ar_mobile + es_desktop + en_mobile).**
Covers: model load, full-res mask (output = original pixel size, e.g. 1920×2877), presets none/product/ID/sticker PNG export, erase brush + undo, Pro gate on multi-file for free users, Pro batch ZIP, RTL, no page errors.

Engine actually exercised: **IS-Net (Apache-2.0) on WASM**, ~10 s per 1024² inference on this box's CPU (single thread, no cross-origin isolation). Phones will be slower (estimate 15–60 s; not measured on a real phone).
BiRefNet (MIT) WebGPU path: **not verified in the browser**. This box's headless GPU (SwiftShader) lacks the storage-buffer limit ORT needs, so the app correctly falls back to IS-Net. BiRefNet-lite was run offline with onnxruntime (Python, same ONNX) for quality comparison.
Why not BiRefNet everywhere: BiRefNet-lite at 1024² needs ~7 GB RAM on CPU (measured maxrss 7.06 GB) → `std::bad_alloc` in WASM (4 GB cap). IS-Net needs ~0.86 GB.
Rejected: IS-Net int8 quantised (46 MB) – mask IoU vs fp32 only 0.68 on the dog photo.

## Visual results (Wikimedia Commons test photos, see qa/bg/SOURCES.txt)
- **Curly grey/blond hair portrait (hard case):** IS-Net kept individual curls and flyaways with soft alpha; very good. Some sofa fabric at bottom-left left in the cutout → needs the erase brush. BiRefNet-lite (offline): crisper body edge, curls also good, sofa removed.
- **Old B&W photo, two people + small dog:** IS-Net kept both people and the dog, but also some rock/grass between them → brush needed. BiRefNet-lite dropped the dog (treated as background).
- **Sneaker on a leg:** both keep the leg + sock (it's a "salient object"); laces/edges clean. For product shots the subject must be the shoe alone.
- ID-photo preset only resizes/recolours; it needs a head-and-shoulders photo. It does not check official rules.
Not tested: glass/transparent objects, smoke, real phones, Safari/iOS, a real WebGPU GPU. No side-by-side vs remove.bg was run; the landing page says so.

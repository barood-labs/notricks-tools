// Watermark-free document scanner: camera/upload -> auto edge detection (OpenCV.js, lazy) -> manual corners -> perspective crop -> filters -> PDF/JPG.
let cvReady = null;
export function loadCv() {
  if (cvReady) return cvReady;
  cvReady = new Promise((resolve, reject) => {
    const s = document.createElement('script'); s.src = new URL('vendor/opencv.js', document.baseURI).href; s.async = true;
    s.onload = async () => { try { let cv = window.cv; if (cv instanceof Promise || (cv && typeof cv.then === 'function' && !cv.Mat)) cv = await cv;
      if (!cv.Mat) await new Promise(r => { cv.onRuntimeInitialized = r; }); window.cv = cv; resolve(cv); } catch (e) { reject(e); } };
    s.onerror = () => reject(new Error('OpenCV failed to load')); document.head.appendChild(s);
  });
  return cvReady;
}
export async function fileToCanvas(file, max = 2000) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height)); const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); return c;
}
const order = pts => { // tl, tr, br, bl
  const s = pts.map(p => p.x + p.y), d = pts.map(p => p.y - p.x);
  return [pts[s.indexOf(Math.min(...s))], pts[d.indexOf(Math.min(...d))], pts[s.indexOf(Math.max(...s))], pts[d.indexOf(Math.max(...d))]];
};
export function detectCorners(cv, canvas) {
  const W = canvas.width, H = canvas.height, k = Math.min(1, 700 / Math.max(W, H));
  const src = cv.imread(canvas), small = new cv.Mat(), gray = new cv.Mat(), edges = new cv.Mat(), contours = new cv.MatVector(), hier = new cv.Mat();
  let best = null, bestArea = 0;
  try {
    cv.resize(src, small, new cv.Size(Math.round(W * k), Math.round(H * k)), 0, 0, cv.INTER_AREA);
    cv.cvtColor(small, gray, cv.COLOR_RGBA2GRAY); cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
    cv.Canny(gray, edges, 50, 150); const kern = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3)); cv.dilate(edges, edges, kern); kern.delete();
    cv.findContours(edges, contours, hier, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
    const minArea = small.rows * small.cols * 0.15;
    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i), peri = cv.arcLength(c, true), ap = new cv.Mat();
      cv.approxPolyDP(c, ap, 0.02 * peri, true); const area = Math.abs(cv.contourArea(ap));
      if (ap.rows === 4 && area > minArea && area > bestArea && cv.isContourConvex(ap)) { bestArea = area; best = []; for (let j = 0; j < 4; j++) best.push({ x: ap.data32S[j*2] / k, y: ap.data32S[j*2+1] / k }); }
      ap.delete(); c.delete();
    }
  } finally { [src, small, gray, edges, contours, hier].forEach(m => m.delete()); }
  if (!best) { const m = 0.03; return { auto: false, pts: [{x:W*m,y:H*m},{x:W*(1-m),y:H*m},{x:W*(1-m),y:H*(1-m)},{x:W*m,y:H*(1-m)}] }; }
  return { auto: true, pts: order(best) };
}
export function warp(cv, canvas, pts) {
  const [tl, tr, br, bl] = pts, dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const w = Math.round(Math.max(dist(tl, tr), dist(bl, br))), h = Math.round(Math.max(dist(tl, bl), dist(tr, br)));
  const src = cv.imread(canvas), dst = new cv.Mat();
  const a = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
  const b = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, w, 0, w, h, 0, h]); const M = cv.getPerspectiveTransform(a, b);
  cv.warpPerspective(src, dst, M, new cv.Size(w, h), cv.INTER_LINEAR, cv.BORDER_REPLICATE);
  const out = document.createElement('canvas'); cv.imshow(out, dst); [src, dst, a, b, M].forEach(m => m.delete()); return out;
}
export function applyFilter(cv, canvas, filter) {
  if (filter === 'color') return canvas;
  const src = cv.imread(canvas), out = document.createElement('canvas'); const g = new cv.Mat();
  try {
    if (filter === 'gray') { cv.cvtColor(src, g, cv.COLOR_RGBA2GRAY); cv.imshow(out, g); }
    else if (filter === 'bw') { cv.cvtColor(src, g, cv.COLOR_RGBA2GRAY); const bw = new cv.Mat(); const bs = Math.max(15, (Math.round(Math.min(src.cols, src.rows) / 40) | 1));
      cv.adaptiveThreshold(g, bw, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, bs, 12); cv.imshow(out, bw); bw.delete(); }
    else { // enhance: per-channel contrast stretch + slight brightening of background
      const ch = new cv.MatVector(); cv.split(src, ch);
      for (let i = 0; i < 3; i++) { const m = ch.get(i); cv.normalize(m, m, 0, 255, cv.NORM_MINMAX); m.convertTo(m, -1, 1.25, -20); ch.set(i, m); m.delete(); }
      const merged = new cv.Mat(); cv.merge(ch, merged); cv.imshow(out, merged); merged.delete(); ch.delete(); }
  } finally { src.delete(); g.delete(); }
  return out;
}

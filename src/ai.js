// On-device AI for No-Tricks Tools. Document text never leaves the browser.
// Engines (best first): Chrome built-in AI (Summarizer / Translator APIs, Gemini Nano on-device)
// -> transformers.js (ONNX models run in WebAssembly/WebGPU; only the model weights are downloaded)
// -> built-in extractive summarizer (pure JS, works offline, EN + AR).
const TJS = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.1';
const MT = { 'en-ar': 'Xenova/opus-mt-en-ar', 'ar-en': 'Xenova/opus-mt-ar-en' };
let tjs, pipes = {};

export const detectLang = s => ((s.match(/[\u0600-\u06FF]/g) || []).length > (s.match(/[A-Za-z]/g) || []).length ? 'ar' : 'en');

export async function pdfText(pdfjs, data, maxPages = 50) {
  const doc = await pdfjs.getDocument({ data }).promise, pages = [];
  for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    pages.push(c.items.map(it => it.str + (it.hasEOL ? '\n' : ' ')).join('').replace(/[ \t]+/g, ' ').trim());
  }
  return { pages, numPages: doc.numPages };
}

const sentences = s => s.replace(/\s+/g, ' ').split(/(?<=[.!?؟。])\s+|\n+/).map(x => x.trim()).filter(x => x.length > 20);
const STOP = new Set('the a an and or of to in on for is are was were be by with that this it as at from but not have has had you we they he she i our your their its will can مع في من على إلى الى عن أن ان هذا هذه ذلك التي الذي هو هي كان كانت لا ما و أو ثم قد كل بين عند'.split(' '));
const words = s => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));
// TextRank-style extractive summary: sentence graph by word overlap, PageRank, keep original order.
export function extractive(text, n = 5) {
  const S = sentences(text).slice(0, 400); if (S.length <= n) return S;
  const W = S.map(s => new Set(words(s))), N = S.length;
  const sim = (a, b) => { let o = 0; for (const w of a) if (b.has(w)) o++; return o ? o / (Math.log(a.size + 1) + Math.log(b.size + 1)) : 0; };
  const M = W.map(a => W.map(b => (a === b ? 0 : sim(a, b))));
  const out = M.map(r => r.reduce((x, y) => x + y, 0) || 1);
  let r = Array(N).fill(1 / N);
  for (let k = 0; k < 30; k++) r = r.map((_, i) => 0.15 / N + 0.85 * M.reduce((acc, row, j) => acc + (row[i] * r[j]) / out[j], 0));
  return r.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, n).map(x => x[1]).sort((a, b) => a - b).map(i => S[i]);
}

export async function chromeSummarizer() {
  try { if (!('Summarizer' in self)) return null; const a = await Summarizer.availability(); return a === 'unavailable' ? null : a; } catch { return null; }
}
export async function chromeTranslator(src, tgt) {
  try { if (!('Translator' in self)) return null; const a = await Translator.availability({ sourceLanguage: src, targetLanguage: tgt }); return a === 'unavailable' ? null : a; } catch { return null; }
}

export async function summarize(text, lang, onStatus = () => {}) {
  const forced = new URLSearchParams(location.search).get('ai');
  if (forced !== 'basic' && await chromeSummarizer()) {
    try {
      onStatus('chrome');
      const s = await Summarizer.create({ type: 'key-points', format: 'plain-text', length: 'medium', outputLanguage: lang === 'ar' ? 'en' : 'en' });
      const res = await s.summarize(text.slice(0, 12000));
      return { engine: 'Chrome built-in AI (Gemini Nano, on-device)', points: res.split(/\n+/).map(x => x.replace(/^[-*•\s]+/, '')).filter(Boolean) };
    } catch (e) { console.warn('Summarizer failed, fallback', e); }
  }
  onStatus('basic');
  return { engine: 'On-device extractive AI (TextRank)', points: extractive(text, 5) };
}

async function loadTjs() { if (!tjs) { tjs = await import(/* @vite-ignore */ TJS); tjs.env.allowLocalModels = false; } return tjs; }

// Translate an array of paragraphs. onProgress(doneCount, total, info)
export async function translate(paras, src, tgt, onProgress = () => {}) {
  const forced = new URLSearchParams(location.search).get('ai');
  if (forced !== 'tjs' && await chromeTranslator(src, tgt)) {
    try {
      const tr = await Translator.create({ sourceLanguage: src, targetLanguage: tgt });
      const out = []; for (const p of paras) { out.push(await tr.translate(p)); onProgress(out.length, paras.length); }
      return { engine: 'Chrome built-in Translator (on-device)', out };
    } catch (e) { console.warn('Translator failed, fallback', e); }
  }
  const T = await loadTjs(), key = src + '-' + tgt;
  if (!pipes[key]) pipes[key] = await T.pipeline('translation', MT[key], { dtype: 'q8', progress_callback: p => { if (p.status === 'progress') onProgress(0, paras.length, { model: Math.round(p.progress) }); } });
  const out = [];
  for (const p of paras) { const chunks = chunk(p, 350); let r = ''; for (const c of chunks) r += (await pipes[key](c, { max_new_tokens: 512 }))[0].translation_text + ' '; out.push(r.trim()); onProgress(out.length, paras.length); }
  return { engine: 'transformers.js · ' + MT[key] + ' (in your browser)', out };
}
function chunk(p, max) { const s = p.split(/(?<=[.!?؟])\s+/), o = []; let cur = ''; for (const x of s) { if ((cur + ' ' + x).length > max && cur) { o.push(cur); cur = x; } else cur = cur ? cur + ' ' + x : x; } if (cur) o.push(cur); return o.flatMap(c => c.length > max * 1.5 ? c.match(new RegExp('.{1,' + max + '}(\\s|$)', 'g')) : [c]); }

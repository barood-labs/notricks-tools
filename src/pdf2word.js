// Best-effort PDF -> DOCX: text, font sizes, bold/italic, indentation, simple tables (position clustering), embedded images.
const RTL_RE = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const mul = (a, b) => [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];

async function pageImages(pdfjs, page, opList) {
  const imgs = []; let ctm = [1,0,0,1,0,0]; const stack = [];
  const { OPS } = pdfjs;
  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i], args = opList.argsArray[i];
    if (fn === OPS.save) stack.push(ctm); else if (fn === OPS.restore) ctm = stack.pop() || [1,0,0,1,0,0];
    else if (fn === OPS.transform) ctm = mul(ctm, args);
    else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
      const w = Math.abs(ctm[0]) + Math.abs(ctm[2]), h = Math.abs(ctm[3]) + Math.abs(ctm[1]);
      if (w < 24 || h < 24) continue; // skip tiny decorations
      let obj = fn === OPS.paintInlineImageXObject ? args[0] : await new Promise(r => { const tm = setTimeout(() => r(null), 5000); try { page.objs.get(args[0], o => { clearTimeout(tm); r(o); }); } catch { clearTimeout(tm); r(null); } });
      if (!obj) continue;
      try { imgs.push({ y: ctm[5] + h, x: ctm[4], w, h, png: await toPng(obj) }); } catch (e) { console.warn('image skipped', e); }
    }
  }
  return imgs;
}
async function toPng(obj) {
  const c0 = document.createElement('canvas'); c0.width = obj.width; c0.height = obj.height; const ctx = c0.getContext('2d');
  if (obj.bitmap) ctx.drawImage(obj.bitmap, 0, 0);
  else { const id = ctx.createImageData(obj.width, obj.height); const d = obj.data, n = obj.width * obj.height;
    if (d.length === n * 4) id.data.set(d);
    else if (d.length === n * 3) for (let i = 0, j = 0; i < n; i++) { id.data[j++] = d[i*3]; id.data[j++] = d[i*3+1]; id.data[j++] = d[i*3+2]; id.data[j++] = 255; }
    else for (let i = 0, j = 0; i < n; i++) { const g = d[i] ?? 0; id.data[j++] = g; id.data[j++] = g; id.data[j++] = g; id.data[j++] = 255; }
    ctx.putImageData(id, 0, 0); }
  let c = c0; const k = Math.min(1, 1400 / Math.max(obj.width, obj.height));
  if (k < 1) { c = document.createElement('canvas'); c.width = Math.round(obj.width * k); c.height = Math.round(obj.height * k); c.getContext('2d').drawImage(c0, 0, 0, c.width, c.height); }
  const b = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85)); return new Uint8Array(await b.arrayBuffer());
}

function buildLines(page, tc) {
  const lines = [];
  for (const it of tc.items) {
    if (it.str === undefined) continue;
    const s = it.str.replace(/\u0000/g, ''); const y = it.transform[5], h = Math.abs(it.transform[3]) || it.height || 10;
    if (!s) continue;
    let ln = lines.find(l => Math.abs(l.y - y) < Math.max(h, l.h) * 0.45);
    if (!ln) { ln = { y, h: 0, parts: [] }; lines.push(ln); }
    let font = {}; try { if (page.commonObjs.has(it.fontName)) font = page.commonObjs.get(it.fontName) || {}; } catch {}
    const fname = (font.name || '') + ' ' + ((tc.styles[it.fontName] || {}).fontFamily || '');
    ln.parts.push({ x: it.transform[4], w: it.width, s, h, bold: /bold|black|heavy|semibold/i.test(fname) || font.bold, italic: /italic|oblique/i.test(fname) || font.italic });
    if (s.trim()) ln.h = Math.max(ln.h, h);
  }
  for (const l of lines) {
    if (!l.h) l.h = 10;
    l.rtl = RTL_RE.test(l.parts.map(p => p.s).join(''));
    l.parts.sort((a, b) => l.rtl ? (b.x + b.w) - (a.x + a.w) : a.x - b.x);
    // split into cells on big gaps, and runs inside cells
    l.cells = []; let cell = null, lastEnd = null;
    for (const p of l.parts) {
      if (!p.s.trim()) { if (cell && cell.runs.length && !/\s$/.test(cell.runs.at(-1).text)) cell.runs.at(-1).text += ' '; continue; }
      const gap = lastEnd === null ? 0 : (l.rtl ? lastEnd - (p.x + p.w) : p.x - lastEnd);
      if (!cell || gap > l.h * 2.2) { cell = { runs: [], x0: p.x, x1: p.x + p.w }; l.cells.push(cell); }
      else if (gap > l.h * 0.18 && cell.runs.length && !/\s$/.test(cell.runs.at(-1).text)) cell.runs.at(-1).text += ' ';
      const last = cell.runs.at(-1);
      if (last && last.bold === p.bold && last.italic === p.italic && Math.abs(last.h - p.h) < 0.5) last.text += p.s; else cell.runs.push({ text: p.s, bold: p.bold, italic: p.italic, h: p.h });
      cell.x0 = Math.min(cell.x0, p.x); cell.x1 = Math.max(cell.x1, p.x + p.w); lastEnd = l.rtl ? p.x : p.x + p.w;
    }
    for (const c of l.cells) { c.runs.forEach(r => r.text = r.text.normalize('NFKC').replace(/\s+/g, ' ')); c.text = c.runs.map(r => r.text).join('').trim(); }
    l.cells = l.cells.filter(c => c.text);
    l.x0 = Math.min(...l.cells.map(c => c.x0)); l.x1 = Math.max(...l.cells.map(c => c.x1));
  }
  return lines.filter(l => l.cells.length).sort((a, b) => b.y - a.y);
}

export async function pdfToDocx(pdfjs, D, data) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, PageBreak, AlignmentType, Table, TableRow, TableCell, WidthType, ImageRun } = D;
  const pdf = await pdfjs.getDocument({ data }).promise;
  const children = []; let chars = 0, tables = 0, images = 0;
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p); const vp = page.getViewport({ scale: 1 });
    const opList = await page.getOperatorList(); // also loads fonts into commonObjs
    const tc = await page.getTextContent();
    const lines = buildLines(page, tc); const imgs = await pageImages(pdfjs, page, opList);
    const hs = lines.map(l => l.h).sort((a, b) => a - b); const med = hs[Math.floor(hs.length / 2)] || 10;
    const leftMin = Math.min(...lines.filter(l => !l.rtl).map(l => l.x0), Infinity), rightMax = Math.max(...lines.filter(l => l.rtl).map(l => l.x1), -Infinity);
    const blocks = [...lines.map(l => ({ t: 'line', y: l.y, l })), ...imgs.map(i => ({ t: 'img', y: i.y, i }))].sort((a, b) => b.y - a.y);
    let para = null, prevLine = null;
    const flush = () => { if (para) { children.push(new Paragraph(para)); para = null; } };
    const runsOf = (cell, rtl) => cell.runs.map(r => new TextRun({ text: r.text, bold: !!r.bold, italics: !!r.italic, size: Math.max(12, Math.round(r.h * 2)), rightToLeft: rtl }));
    for (let b = 0; b < blocks.length; b++) {
      const bl = blocks[b];
      if (bl.t === 'img') { flush(); const s = Math.min(1, 600 / bl.i.w);
        children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: 'jpg', data: bl.i.png, transformation: { width: Math.round(bl.i.w * s * 1.33), height: Math.round(bl.i.h * s * 1.33) } })] })); images++; prevLine = null; continue; }
      const l = bl.l; chars += l.cells.reduce((a, c) => a + c.text.length, 0);
      // table: >=2 consecutive lines with the same number (>=2) of cells
      if (l.cells.length >= 2) {
        const rows = [l]; let k = b + 1;
        while (k < blocks.length && blocks[k].t === 'line' && blocks[k].l.cells.length === l.cells.length) { rows.push(blocks[k].l); k++; }
        if (rows.length >= 2) { flush(); const n = l.cells.length, rtl = l.rtl;
          children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, visuallyRightToLeft: rtl,
            rows: rows.map(r => new TableRow({ children: r.cells.map(c => new TableCell({ width: { size: Math.floor(100 / n), type: WidthType.PERCENTAGE }, children: [new Paragraph({ bidirectional: r.rtl, alignment: r.rtl ? AlignmentType.RIGHT : undefined, children: runsOf(c, r.rtl) })] })) })) }));
          children.push(new Paragraph({ children: [] })); tables++; b = k - 1; prevLine = null; continue; }
      }
      const indentPt = l.rtl ? (rightMax - l.x1) : (l.x0 - leftMin); const indent = indentPt > 12 ? Math.round(indentPt * 20) : 0;
      const heading = l.h > med * 1.25 && l.cells.map(c => c.text).join(' ').length < 120;
      const cont = para && !heading && prevLine && !prevLine.heading && para.bidirectional === l.rtl && Math.abs(prevLine.h - l.h) < 1 && (prevLine.y - l.y) < l.h * 1.8 && Math.abs((para.indent?.[l.rtl ? 'right' : 'left'] || 0) - indent) < 240;
      const runs = l.cells.flatMap((c, i) => i ? [new TextRun({ text: '\t' }), ...runsOf(c, l.rtl)] : runsOf(c, l.rtl));
      if (cont) para.children.push(new TextRun({ text: ' ', rightToLeft: l.rtl }), ...runs);
      else { flush(); para = { bidirectional: l.rtl, alignment: l.rtl ? AlignmentType.RIGHT : undefined, spacing: { after: 120 }, children: runs };
        if (indent) para.indent = l.rtl ? { right: indent } : { left: indent };
        if (heading) { para.heading = l.h > med * 1.7 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2; flush(); } }
      prevLine = { ...l, heading };
    }
    flush();
    if (p < pdf.numPages) children.push(new Paragraph({ children: [new PageBreak()] }));
  }
  if (chars < 5 && !images) return { empty: true, pages: pdf.numPages };
  const blob = await Packer.toBlob(new Document({ sections: [{ children }] }));
  return { blob, pages: pdf.numPages, tables, images, chars, noText: chars < 5 };
}

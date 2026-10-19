import { chromium } from 'playwright-core'; import fs from 'fs';
const U = process.env.BASE_URL || 'http://localhost:4173/', P = process.env.SHOT_PREFIX || '', S = 'qa/samples/', O = '/tmp/scanout/';
fs.mkdirSync(O, { recursive: true }); const GT = JSON.parse(fs.readFileSync(S + 'scan_gt.json'));
const b = await chromium.launch({ executablePath:'/usr/bin/google-chrome', args:['--no-sandbox'] }); let pass = 0, fail = [];
const ok = (n, c, d='') => { if (c) pass++; else fail.push(n + ' ' + d); };
for (const lang of ['en','ar']) for (const vp of ['desktop','mobile']) {
  const ctx = await b.newContext(vp==='mobile'?{viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,acceptDownloads:true}:{viewport:{width:1280,height:860},acceptDownloads:true});
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); const tag = lang + '_' + vp;
  const shot = n => p.screenshot({ path: `screenshots/${P}${tag}_${n}.png`, fullPage: true });
  const dl = async (sel, name) => { const [d] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.click(sel)]); await d.saveAs(O + tag + '_' + name); return O + tag + '_' + name; };
  try {
    await p.goto(`${U}?lang=${lang}#/scan`); await p.waitForSelector('#camBtn');
    ok(tag + ' camera input capture=environment', (await p.getAttribute('#cam', 'capture')) === 'environment');
    const t0 = Date.now(); await p.setInputFiles('#f', ['scan_desk.jpg','scan_phone.jpg','scan_tilt.jpg'].map(f => S + f));
    await p.waitForFunction(() => document.querySelectorAll('#lst li').length === 3, null, { timeout: 120000 }); ok(tag + ' 3 pages', true, (Date.now()-t0)+'ms');
    const det = await p.evaluate(() => window.__scan.pages.map(pg => ({ auto: pg.auto, pts: pg.pts, W: pg.src.width })));
    ['scan_desk.jpg','scan_phone.jpg','scan_tilt.jpg'].forEach((f, i) => { const g = GT[f], d = det[i]; const err = Math.max(...g.map((q, j) => Math.hypot(q[0] - d.pts[j].x, q[1] - d.pts[j].y)));
      ok(`${tag} edges ${f}`, d.auto && err < d.W * 0.025, 'maxErr=' + err.toFixed(1)); });
    await shot('14_scan_pages');
    // filters
    for (const f of ['bw','gray','color','enhance']) { await p.selectOption('#lst select[data-i="0"]', f); }
    await p.selectOption('#lst select[data-i="0"]', 'bw'); ok(tag + ' filter bw applied', await p.evaluate(() => window.__scan.pages[0].filter === 'bw'));
    // corner editor drag
    await p.click('#lst button[data-a=e][data-i="1"]'); await p.waitForSelector('#editor:not([hidden])');
    const before = await p.evaluate(() => window.__scan.pages[1].pts[0]);
    const box = await p.locator('#ed').boundingBox(); const W = await p.evaluate(() => document.getElementById('ed').width), H = await p.evaluate(() => document.getElementById('ed').height);
    const sx = box.x + before.x * box.width / W, sy = box.y + before.y * box.height / H;
    await p.mouse.move(sx, sy); await p.mouse.down(); await p.mouse.move(sx + 15, sy + 15, { steps: 5 }); await p.mouse.up();
    await shot('15_scan_corners'); await p.click('#edOk');
    const after = await p.evaluate(() => window.__scan.pages[1].pts[0]); ok(tag + ' manual corner drag', Math.hypot(after.x - before.x, after.y - before.y) > 10, JSON.stringify([before, after]));
    // restore precise corners for output checks, reorder, delete
    await p.evaluate(g => window.__scan.setCorners(1, g.map(([x, y]) => ({ x, y }))), GT['scan_phone.jpg']);
    await p.click('#lst button[data-a=d][data-i="0"]'); ok(tag + ' reorder', await p.evaluate(() => window.__scan.pages[1].filter === 'bw'));
    await p.click('#lst button[data-a=x][data-i="2"]'); ok(tag + ' delete', (await p.$$('#lst li')).length === 2);
    await p.click('#pdfBtn'); await p.waitForSelector('#out a.btn'); const pdf = await dl('#out a.btn', 'scan.pdf'); ok(tag + ' pdf export', fs.statSync(pdf).size > 20000);
    await p.click('#jpgBtn'); await p.waitForSelector('#out a.btn >> nth=1'); const j1 = await dl('#out a.btn >> nth=0', 'scan_1.jpg'); await dl('#out a.btn >> nth=1', 'scan_2.jpg'); ok(tag + ' jpg export', fs.statSync(j1).size > 20000);
    await shot('16_scan_export');
    ok(tag + ' no watermark text in page', !(await p.evaluate(() => document.body.innerText)).match(/watermarked by|scanned with/i));
    const r = await p.goto(`${U}${lang}/document-scanner/`); ok(tag + ' landing', r.status() === 200);
    if (vp === 'mobile') await shot('17_scan_landing');
  } catch (e) { fail.push(tag + ': ' + e.message.split('\n')[0]); await shot('zz_scan_error'); }
  ok(tag + ' no js errors', errs.length === 0, errs.join('|')); await ctx.close();
}
await b.close(); console.log('PASS', pass, 'FAIL', JSON.stringify(fail));

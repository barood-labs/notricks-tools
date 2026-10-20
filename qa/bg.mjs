import { chromium } from 'playwright-core'; import fs from 'fs';
const U = process.env.BASE_URL || 'http://localhost:4173/', O = 'qa/bg/out/'; fs.mkdirSync(O, { recursive: true });
const b = await chromium.launch({ executablePath:'/usr/bin/google-chrome', args:['--no-sandbox','--enable-unsafe-webgpu'] });
let pass = 0; const fail = [], log = [];
const ok = (n, c, d='') => { (c ? pass++ : fail.push(n+' '+d)); log.push((c?'PASS ':'FAIL ')+n+' '+d); console.log(log.at(-1)); };
const imgs = (process.env.IMGS || 'hair.jpg,dog.jpg,shoe.jpg').split(',');
for (const [lang, vp] of (process.env.MATRIX || 'en:desktop,ar:mobile').split(',').map(s => s.split(':'))) {
  const ctx = await b.newContext(vp==='mobile'?{viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,acceptDownloads:true}:{viewport:{width:1280,height:860},acceptDownloads:true});
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); const tag = lang+'_'+vp;
  await p.goto(`${U}?lang=${lang}#/bg`); await p.waitForSelector('#mdl');
  await p.waitForFunction(() => document.querySelector('#mdlInfo').textContent.length > 3); console.log(tag+' info: '+await p.textContent('#mdlInfo')); p.on('console', m => ['error','warning'].includes(m.type()) && console.log('CONSOLE', m.text().slice(0,300)));
  ok(tag+' rtl', (await p.getAttribute('html','dir')) === (lang==='ar'?'rtl':'ltr'));
  for (const f of imgs) {
    const t0 = Date.now(); await p.setInputFiles('#f', 'qa/bg/'+f);
    await p.waitForFunction(() => document.querySelector('#out .ok, #out .err'), null, { timeout: 900000 });
    const res = await p.textContent('#out'); ok(`${tag} ${f} processed`, !/went wrong/.test(res), res+' wall='+(Date.now()-t0)+'ms');
    const st = await p.evaluate(() => { const c = window.__bg.cur, a = c.alpha; let fg=0, soft=0; for (const v of a) { if (v>128) fg++; if (v>10&&v<245) soft++; } return { w:c.src.width, h:c.src.height, fg: fg/a.length, soft: soft/a.length }; });
    ok(`${tag} ${f} full-res mask`, st.w >= 1000, JSON.stringify(st));
    ok(`${tag} ${f} plausible fg`, st.fg > 0.05 && st.fg < 0.9, st.fg.toFixed(3));
    for (const preset of ['none','product','id','sticker']) {
      await p.selectOption('#preset', preset); if (preset==='none') await p.selectOption('#bgt', 'none');
      const [d] = await Promise.all([p.waitForEvent('download', { timeout: 120000 }), p.click('#savePng')]); const fn = `${O}${tag}_${f.replace('.jpg','')}_${preset}.png`; await d.saveAs(fn);
      ok(`${tag} ${f} ${preset} png`, fs.statSync(fn).size > 5000);
    }
    await p.selectOption('#preset','none'); await p.selectOption('#bgt','blur');
    await p.screenshot({ path: `${O}${tag}_${f}_blur_screen.png`, fullPage: false });
    // brush: erase at center then undo
    const before = await p.evaluate(() => window.__bg.cur.alpha.reduce((s,v)=>s+v,0));
    const fp = await p.evaluate(() => { const c = window.__bg.cur, W = c.src.width; let best = 0; for (let i = 0; i < c.alpha.length; i += 997) if (c.alpha[i] > 250) { best = i; break; } return { fx: (best % W) / W, fy: Math.floor(best / W) / c.src.height }; });
    await p.evaluate(fy => { const cv = document.querySelector('#cv'), b = cv.getBoundingClientRect(); window.scrollBy(0, b.top + b.height * fy - innerHeight / 2); }, fp.fy);
    const bx = await p.locator('#cv').boundingBox(); const X = bx.x + bx.width * fp.fx, Y = bx.y + bx.height * fp.fy; await p.mouse.move(X, Y); await p.mouse.down(); await p.mouse.move(X + 8, Y + 4); await p.mouse.up();
    const after = await p.evaluate(() => window.__bg.cur.alpha.reduce((s,v)=>s+v,0)); ok(`${tag} ${f} brush erases`, after < before);
    await p.click('#undo'); const und = await p.evaluate(() => window.__bg.cur.alpha.reduce((s,v)=>s+v,0)); ok(`${tag} ${f} undo`, und === before || und > after);
    await p.selectOption('#bgt','none');
  }
  // batch gating
  await p.setInputFiles('#f', imgs.slice(0,2).map(f=>'qa/bg/'+f)); await p.waitForTimeout(500);
  ok(tag+' batch gated for free users', await p.locator('#out .err a[href="#/pro"]').count() > 0);
  await p.waitForFunction(() => document.querySelector('#out .ok'), null, { timeout: 900000 });
  if (process.env.PRO_HASH) { await p.evaluate(h => localStorage.setItem('ntpro', h), process.env.PRO_HASH); await p.reload(); await p.waitForSelector('#mdl');
    await p.setInputFiles('#f', imgs.slice(0,2).map(f=>'qa/bg/'+f));
    const [d] = await Promise.all([p.waitForEvent('download', { timeout: 900000 }), p.waitForSelector('#out a[download="cutouts.zip"]', { timeout: 900000 }).then(e => e.click())]);
    await d.saveAs(O+tag+'_batch.zip'); ok(tag+' pro batch zip', fs.statSync(O+tag+'_batch.zip').size > 10000); }
  await p.screenshot({ path: `screenshots/${tag}_20_bg.png`, fullPage: true });
  ok(tag+' no page errors', !errs.length, errs.join('|')); await ctx.close();
}
await b.close(); console.log(log.join('\n')); console.log(`\n${pass} passed, ${fail.length} failed`); fs.writeFileSync('qa/bg_results.txt', log.join('\n')+`\n${pass} passed, ${fail.length} failed\n`);

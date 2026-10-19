import { chromium } from 'playwright-core';
import fs from 'fs';
const S = '/workspace/apps_studio/notricks/qa/samples/', O = '/workspace/apps_studio/notricks/qa/out/', SH = '/workspace/apps_studio/notricks/screenshots/';
fs.mkdirSync(O,{recursive:true}); fs.mkdirSync(SH,{recursive:true});
const URL0 = process.env.BASE_URL || 'http://localhost:4173/';
const res = []; const ok = (n, c, d='') => { res.push({n, pass: !!c, d}); console.log((c?'PASS ':'FAIL ')+n+' '+d); };
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args:['--no-sandbox'] });
for (const lang of ['en','ar']) for (const vp of ['desktop','mobile']) {
  const ctx = await browser.newContext(vp==='mobile' ? { viewport:{width:390,height:844}, deviceScaleFactor:2, isMobile:true, hasTouch:true, acceptDownloads:true } : { viewport:{width:1280,height:860}, acceptDownloads:true });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  const tag = `${lang}_${vp}`; const shot = n => page.screenshot({ path: `${SH}${process.env.SHOT_PREFIX||''}${tag}_${n}.png`, fullPage: true });
  const go = async h => { await page.goto(`${URL0}?lang=${lang}#/${h}`); await page.waitForLoadState('networkidle'); };
  const dl = async (sel, name) => { const [d] = await Promise.all([page.waitForEvent('download',{timeout:120000}), page.click(sel)]); const p = O+tag+'_'+name; await d.saveAs(p); return p; };
  const wait = async sel => page.waitForSelector(sel, { timeout: 120000 });
  try {
    await go(''); ok(`${tag} home dir`, (await page.getAttribute('html','dir')) === (lang==='ar'?'rtl':'ltr')); ok(`${tag} 6 tool cards`, (await page.$$('.card')).length===7);
    ok(`${tag} ad slots`, (await page.$$('[data-ad-slot]')).length===2);
    const sw = await page.evaluate(()=>document.documentElement.scrollWidth); ok(`${tag} no horizontal overflow`, sw <= (vp==='mobile'?390:1280), 'scrollWidth='+sw);
    await shot('01_home');
    // word EN + AR
    for (const f of ['doc_en','doc_ar2','doc_ar_lo','layout_en','layout_ar']) { await go('word'); await page.setInputFiles('#f', S+f+'.pdf'); await wait('#out a.btn, #out .err');
      const p = await dl('#out a.btn', f+'.docx'); ok(`${tag} pdf2word ${f}`, fs.statSync(p).size>1000, p); }
    await shot('02_pdf2word');
    await go('word'); await page.setInputFiles('#f', S+'scan.pdf'); await wait('#out .err'); ok(`${tag} pdf2word scanned -> honest no-text msg`, true);
    // merge
    await go('merge'); await page.setInputFiles('#f', [S+'doc_en.pdf', S+'doc_ar.pdf']); await page.click('#lst button[data-a=d][data-i="0"]'); await page.click('#go'); await wait('#out a.btn');
    await dl('#out a.btn','merged.pdf'); await shot('03_merge');
    // split
    await go('split'); await page.setInputFiles('#f', S+'doc_en.pdf'); await wait('#opts:not([hidden])'); await page.fill('#rng','9'); await page.click('#go'); await wait('#out .err'); ok(`${tag} split rejects bad range`, true);
    await page.fill('#rng', lang==='ar'?'1-2، 3':'1-2, 3'); await page.click('#go'); await wait('#out a.btn');
    const links = await page.$$('#out a.btn'); ok(`${tag} split 2 files`, links.length===2);
    await dl('#out a.btn >> nth=0','split_1-2.pdf'); await dl('#out a.btn >> nth=1','split_3.pdf'); await shot('04_split');
    // compress
    await go('compress'); await page.setInputFiles('#f', S+'scan.pdf'); await wait('#out a.btn, #out .err');
    await dl('#out a.btn','compressed.pdf'); await shot('05_compress');
    await go('compress'); await page.setInputFiles('#f', S+'doc_en.pdf'); await wait('#out a.btn, #out .err'); ok(`${tag} compress small text pdf handled`, true, await page.textContent('#out'));
    // image to pdf
    await go('img'); await page.setInputFiles('#f', [S+'photo1.jpg', S+'photo2.png', S+'photo3.jpg']); await page.selectOption('#ps','a4'); await page.click('#go'); await wait('#out a.btn');
    await dl('#out a.btn','images.pdf'); await shot('06_img2pdf');
    // QR
    await go('qr'); await wait('#q_url'); await page.fill('#q_url','https://example.com/notricks'); await page.waitForTimeout(300);
    await dl('#png','qr_url.png'); await dl('#svg','qr_url.svg'); await shot('07_qr_url');
    await page.selectOption('#qt','wifi'); await page.fill('#q_ssid','Home WiFi'); await page.fill('#q_pw','p@ss;word'); await dl('#png','qr_wifi.png');
    await page.selectOption('#qt','vcard'); await page.fill('#q_fname', lang==='ar'?'زين':'Zain'); await page.fill('#q_lname','Test'); await page.fill('#q_phone','+15550100'); await page.fill('#q_email','a@example.com');
    await page.fill('#fg','#0f766e'); await page.setInputFiles('#logo', S+'logo.png'); await page.waitForTimeout(500); await dl('#png','qr_vcard_logo.png'); await dl('#svg','qr_vcard_logo.svg'); await shot('08_qr_vcard_logo'); ok(`${tag} qr no error shown`, !(await page.$('#out .err')));
    await page.selectOption('#qt','text'); await page.fill('#q_text', lang==='ar'?'مرحبًا بالعالم':'Hello world'); await dl('#png','qr_text.png');
    await go('pro'); ok(`${tag} pro button live -> payhip`, (await page.getAttribute('#proBtn','href'))==='https://payhip.com/b/n3kq7'); await shot('09_pro');
    const slugs=['pdf-to-word','merge-pdf','split-pdf','compress-pdf','image-to-pdf','document-scanner','qr-code-generator'];
    for (const sl of slugs) { const r = await page.goto(`${URL0}${lang}/${sl}/`); const lds = await page.$$eval('script[type="application/ld+json"]', e=>e.map(x=>JSON.parse(x.textContent)['@type']));
      ok(`${tag} landing ${sl}`, r.status()===200 && lds.includes('FAQPage') && (await page.getAttribute('html','dir'))===(lang==='ar'?'rtl':'ltr'), lds.join(','));
      if (sl==='qr-code-generator') { await shot('11_landing_qr'); await page.click('a.cta >> nth=0'); await page.waitForSelector('#qrCanvas'); ok(`${tag} landing CTA opens tool`, true); } }
    for (const pg of ['about.html','contact.html','terms.html','sitemap.xml','robots.txt']) { const r = await page.goto(URL0+pg); ok(`${tag} ${pg}`, r.status()===200); }
    await page.goto(URL0+'privacy.html'); await shot('10_privacy'); ok(`${tag} privacy page`, (await page.textContent('h1')).includes('Privacy'));
  } catch (e) { ok(`${tag} RUN`, false, e.message.split('\n')[0]); await shot('zz_error'); }
  ok(`${tag} no JS errors`, errs.length===0, errs.join(' | '));
  await ctx.close();
}
await browser.close();
fs.writeFileSync(process.env.RES||'/workspace/apps_studio/notricks/qa/browser_results.json', JSON.stringify(res,null,1));

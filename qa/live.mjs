import { chromium } from 'playwright-core'; import fs from 'fs';
const U='https://barood-labs.github.io/notricks-tools/', S='qa/samples/', SH='screenshots/';
const b = await chromium.launch({ executablePath:'/usr/bin/google-chrome', args:['--no-sandbox'] }); let pass=0, fail=[];
const ok=(n,c)=>{c?pass++:fail.push(n)};
for (const lang of ['en','ar']) for (const vp of ['desktop','mobile']) {
  const ctx = await b.newContext(vp==='mobile'?{viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,acceptDownloads:true}:{viewport:{width:1280,height:860},acceptDownloads:true});
  const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); const tag=lang+'_'+vp;
  try {
    const r = await p.goto(`${U}?lang=${lang}#/`); ok(tag+' home 200', r.status()===200); await p.waitForLoadState('networkidle');
    ok(tag+' dir', (await p.getAttribute('html','dir'))===(lang==='ar'?'rtl':'ltr')); ok(tag+' cards', (await p.$$('.card')).length===6);
    if (vp==='mobile' && lang==='ar') await p.screenshot({path:SH+'live_ar_mobile_home.png',fullPage:true});
    if (vp==='desktop' && lang==='en') await p.screenshot({path:SH+'live_en_desktop_home.png',fullPage:true});
    await p.goto(`${U}?lang=${lang}#/merge`); await p.setInputFiles('#f',[S+'doc_en.pdf',S+'doc_ar2.pdf']); await p.click('#go'); await p.waitForSelector('#out a.btn',{timeout:60000});
    const [d]=await Promise.all([p.waitForEvent('download'),p.click('#out a.btn')]); const f='/tmp/live_'+tag+'.pdf'; await d.saveAs(f); ok(tag+' merge download', fs.statSync(f).size>1000);
    if (vp==='desktop' && lang==='ar') await p.screenshot({path:SH+'live_ar_desktop_merge.png',fullPage:true});
    await p.goto(`${U}?lang=${lang}#/qr`); await p.waitForSelector('#q_url'); await p.fill('#q_url','https://example.com/live');
    const [q]=await Promise.all([p.waitForEvent('download'),p.click('#png')]); await q.saveAs('/tmp/live_'+tag+'_qr.png'); ok(tag+' qr png', true);
    if (vp==='mobile' && lang==='en') await p.screenshot({path:SH+'live_en_mobile_qr.png',fullPage:true});
    await p.goto(U+'privacy.html'); ok(tag+' privacy', (await p.textContent('h1')).includes('Privacy'));
  } catch(e){ fail.push(tag+': '+e.message.split('\n')[0]); }
  ok(tag+' no js errors', errs.length===0); await ctx.close();
}
await b.close(); console.log('PASS',pass,'FAIL',JSON.stringify(fail));

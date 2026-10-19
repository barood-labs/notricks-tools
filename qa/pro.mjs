import { chromium } from 'playwright-core';
const U = process.env.BASE_URL || 'http://localhost:4173/', P = process.env.SHOT_PREFIX || '';
const b = await chromium.launch({ executablePath:'/usr/bin/google-chrome', args:['--no-sandbox'] }); let pass=0, fail=[];
const ok=(n,c)=>{c?pass++:fail.push(n)};
for (const lang of ['en','ar']) for (const vp of ['desktop','mobile']) {
  const ctx = await b.newContext(vp==='mobile'?{viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true}:{viewport:{width:1280,height:860}});
  const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); const tag=lang+'_'+vp;
  const adsVisible = () => p.$$eval('.ad-slot', els => els.filter(e => getComputedStyle(e).display !== 'none').length);
  try {
    await p.goto(`${U}?lang=${lang}#/pro`); await p.waitForSelector('#code');
    ok(tag+' payhip link', (await p.getAttribute('#proBtn','href'))==='https://payhip.com/b/n3kq7'); ok(tag+' ads visible before', await adsVisible()===2);
    await p.fill('#code','WRONG-CODE'); await p.click('#unlockForm button'); await p.waitForSelector('#codeMsg.err'); ok(tag+' wrong code rejected', !(await p.evaluate(()=>localStorage.getItem('ntpro'))));
    await p.screenshot({path:`screenshots/${P}${tag}_12_pro_unlock_form.png`, fullPage:true});
    await p.fill('#code','  ntpro-2026-thankyou '); await p.click('#unlockForm button'); await p.waitForSelector('#proThanks');
    ok(tag+' unlocked', true); ok(tag+' badge', await p.isVisible('#proBadge')); ok(tag+' ads hidden', await adsVisible()===0);
    ok(tag+' stores hash not code', !(await p.evaluate(()=>JSON.stringify(localStorage))).includes('THANKYOU'));
    await p.screenshot({path:`screenshots/${P}${tag}_13_pro_thanks.png`, fullPage:true});
    await p.goto(`${U}?lang=${lang}#/qr`); await p.waitForSelector('#qrCanvas'); ok(tag+' persists after reload', await p.isVisible('#proBadge') && await adsVisible()===0);
    await p.goto(`${U}${lang}/merge-pdf/`); ok(tag+' landing ads hidden', await adsVisible()===0);
  } catch(e){ fail.push(tag+': '+e.message.split('\n')[0]); }
  ok(tag+' no js errors', errs.length===0); await ctx.close();
}
const src = await (await fetch(U)).text(); ok('plain code not in html', !src.includes('THANKYOU'));
await b.close(); console.log('PASS',pass,'FAIL',JSON.stringify(fail));

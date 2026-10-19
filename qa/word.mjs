import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath:'/usr/bin/google-chrome', args:['--no-sandbox'] }); const p = await (await b.newContext({acceptDownloads:true})).newPage();
p.on('pageerror',e=>console.log('ERR',e.message)); p.on('console',m=>m.type()==='error'&&console.log('CONSOLE',m.text()));
for (const f of ['doc_en','doc_ar2','doc_ar_lo','layout_en','layout_ar']) { await p.goto('http://localhost:4173/?lang=en#/word'); await p.setInputFiles('#f','qa/samples/'+f+'.pdf');
  await p.waitForSelector('#out a.btn, #out .err'); console.log(f, await p.textContent('#out p'));
  const [d]=await Promise.all([p.waitForEvent('download'),p.click('#out a.btn')]); await d.saveAs('/tmp/w_'+f+'.docx'); }
await b.close();

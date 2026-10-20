import './style.css';
import { T } from './i18n.js';
import { PRO_URL, PRO_PRICE, PRO_CODE_HASH } from './config.js';
let PDFDocument, pdfjs, D, QRCode;
const loadLib = async () => { if (!PDFDocument) ({ PDFDocument } = await import('pdf-lib')); };
const loadPdfjs = async () => { if (!pdfjs) { pdfjs = await import('pdfjs-dist'); const w = await import('pdfjs-dist/build/pdf.worker.min.mjs?url'); pdfjs.GlobalWorkerOptions.workerSrc = w.default; } };
const loadDocx = async () => { if (!D) D = await import('docx'); };
const loadQr = async () => { if (!QRCode) QRCode = (await import('qrcode')).default; };

const qs = new URLSearchParams(location.search);
let lang = qs.get('lang') || localStorage.getItem('lang') || ((navigator.language||'en').startsWith('ar') ? 'ar' : 'en');
if (!T[lang]) lang = 'en';
const t = k => (T[lang] && T[lang][k]) || T.en[k] || k;
const $ = s => document.querySelector(s);
const app = $('#app');
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const kb = n => n > 1048576 ? (n/1048576).toFixed(2)+' MB' : Math.max(1,Math.round(n/1024))+' KB';
const baseName = f => f.name.replace(/\.[^.]+$/, '');

function applyLang(){
  document.documentElement.lang = lang; document.documentElement.dir = lang==='ar'?'rtl':'ltr';
  localStorage.setItem('lang', lang);
  $('#langBtn').textContent = lang==='ar' ? 'English' : 'العربية';
  document.querySelectorAll('[data-i18n]').forEach(e => e.textContent = t(e.dataset.i18n));
  $('#privLink').href = 'privacy.html';
  document.title = lang==='ar' ? 'أدوات بلا خدع – أدوات PDF مجانية وخاصة ورموز QR لا تنتهي صلاحيتها' : 'No-Tricks Tools – Free private PDF tools & QR codes that never expire';
  applyPro(); route();
}
$('#langBtn').onclick = () => { lang = lang==='ar'?'en':'ar'; applyLang(); };

const TOOLS = [['word','📝'],['merge','🧩'],['split','✂️'],['compress','🗜️'],['img','🖼️'],['scan','📷'],['bg','✨'],['qr','🔳']];
function home(){
  app.innerHTML = `<section class="hero"><h1>${t('heroTitle')}</h1><p>${t('heroSub')}</p>
  <div class="badges">${[1,2,3,4].map(i=>`<span>✓ ${t('badge'+i)}</span>`).join('')}</div></section>
  <div class="grid">${TOOLS.map(([k,i])=>`<a class="card" href="#/${k}" id="tool-${k}"><div class="ico">${i}</div><h3>${t('t_'+k)}</h3><p>${t('d_'+k)}</p></a>`).join('')}</div>`;
}
function shell(k, inner){
  app.innerHTML = `<p><a href="#/">${t('back')}</a></p><h1>${t('t_'+k)}</h1>${inner}<div class="out" id="out"></div>`;
}
function dropZone(id, multiple, accept){
  return `<div class="drop" id="dz-${id}"><input type="file" id="${id}" ${multiple?'multiple':''} accept="${accept}" hidden>
  <button class="btn" type="button" onclick="document.getElementById('${id}').click()">${multiple?t('choose'):t('chooseOne')}</button>
  <div>${t('drop')}</div><small>🔒 ${t('privateNote')}</small></div>`;
}
function wireDrop(id, cb){
  const inp = $('#'+id), dz = $('#dz-'+id);
  inp.onchange = () => cb([...inp.files]);
  dz.ondragover = e => { e.preventDefault(); dz.classList.add('over'); };
  dz.ondragleave = () => dz.classList.remove('over');
  dz.ondrop = e => { e.preventDefault(); dz.classList.remove('over'); cb([...e.dataTransfer.files]); };
}
const out = h => { $('#out').innerHTML = h; };
const busy = () => out(`<p>${t('processing')}</p>`);
const fail = e => { console.error(e); out(`<p class="err">${t('error')}${esc(e.message||e)}</p>`); };
function dlLink(blob, name, cls='btn'){ const u = URL.createObjectURL(blob); return `<a class="${cls}" href="${u}" download="${esc(name)}">⬇ ${t('download')} ${esc(name)}</a>`; }
const isPdf = f => f.type==='application/pdf' || /\.pdf$/i.test(f.name);

/* ---------- PDF to Word ---------- */
function toolWord(){
  shell('word', `<p class="note">${t('wordLimit')}</p>${dropZone('f',false,'application/pdf')}`);
  wireDrop('f', async ([f]) => {
    if (!f || !isPdf(f)) return out(`<p class="err">${t('needPdf')}</p>`);
    busy();
    try {
      await loadPdfjs(); await loadDocx(); const { pdfToDocx } = await import('./pdf2word.js');
      const r = await pdfToDocx(pdfjs, D, await f.arrayBuffer());
      if (r.empty) return out(`<p class="err">${t('noText')}</p>`);
      out(`<p class="ok">${t('done')} (${r.pages} ${t('pages')}${r.tables?` · ${r.tables} ${t('tables')}`:''}${r.images?` · ${r.images} ${t('images')}`:''})</p>${r.noText?`<p class="err">${t('noTextImgs')}</p>`:''}${dlLink(r.blob, baseName(f)+'.docx')}`);
    } catch (e) { fail(e); }
  });
}

/* ---------- Merge ---------- */
function toolMerge(){
  let files = [];
  shell('merge', dropZone('f',true,'application/pdf') + `<ul class="list" id="lst"></ul><button class="btn" id="go" disabled>${t('merge')}</button>`);
  const render = () => {
    $('#lst').innerHTML = files.map((f,i)=>`<li><span class="n">${i+1}. ${esc(f.name)} (${kb(f.size)})</span>
      <button class="btn sm" data-a="u" data-i="${i}">↑ ${t('moveUp')}</button><button class="btn sm" data-a="d" data-i="${i}">↓ ${t('moveDown')}</button><button class="btn sm" data-a="x" data-i="${i}">✕ ${t('remove')}</button></li>`).join('');
    $('#go').disabled = files.length < 2;
  };
  $('#lst').onclick = e => { const b = e.target.closest('button'); if (!b) return; const i = +b.dataset.i;
    if (b.dataset.a==='u' && i>0) [files[i-1],files[i]]=[files[i],files[i-1]];
    if (b.dataset.a==='d' && i<files.length-1) [files[i+1],files[i]]=[files[i],files[i+1]];
    if (b.dataset.a==='x') files.splice(i,1); render(); };
  wireDrop('f', fs => { files = files.concat(fs.filter(isPdf)); render(); if (!files.length) out(`<p class="err">${t('needPdf')}</p>`); else out(''); });
  $('#go').onclick = async () => {
    if (files.length < 2) return out(`<p class="err">${t('needTwo')}</p>`);
    busy();
    try { await loadLib(); const doc = await PDFDocument.create();
      for (const f of files) { const src = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true }); (await doc.copyPages(src, src.getPageIndices())).forEach(p => doc.addPage(p)); }
      const blob = new Blob([await doc.save()], { type: 'application/pdf' });
      out(`<p class="ok">${t('done')} (${doc.getPageCount()} ${t('pages')})</p>${dlLink(blob,'merged.pdf')}`);
    } catch (e) { fail(e); }
  };
}

/* ---------- Split ---------- */
function parseRanges(s, n){
  const parts = s.replace(/،/g,',').split(',').map(x=>x.trim()).filter(Boolean); if (!parts.length) return null;
  const res = [];
  for (const p of parts) { const m = p.match(/^(\d+)\s*(?:-\s*(\d+))?$/); if (!m) return null;
    const a = +m[1], b = m[2] ? +m[2] : a; if (a<1 || b>n || a>b) return null; res.push([a,b]); }
  return res;
}
function toolSplit(){
  let file = null, n = 0;
  shell('split', dropZone('f',false,'application/pdf') + `<div id="opts" hidden><p id="info"></p>
   <label for="rng">${t('ranges')}</label><input type="text" id="rng" placeholder="1-3, 5" dir="ltr"><small>${t('rangesHint')}</small>
   <label><input type="checkbox" id="each"> ${t('everyPage')}</label><button class="btn" id="go">${t('split')}</button></div>`);
  wireDrop('f', async ([f]) => { if (!f || !isPdf(f)) return out(`<p class="err">${t('needPdf')}</p>`);
    try { await loadLib(); file = f; n = (await PDFDocument.load(await f.arrayBuffer(), {ignoreEncryption:true})).getPageCount();
      $('#info').textContent = `${f.name} – ${n} ${t('pages')}`; $('#opts').hidden = false; out(''); } catch(e){ fail(e); } });
  $('#go').onclick = async () => {
    const ranges = $('#each').checked ? Array.from({length:n},(_,i)=>[i+1,i+1]) : parseRanges($('#rng').value, n);
    if (!ranges) return out(`<p class="err">${t('badRange')}</p>`);
    busy();
    try { const src = await PDFDocument.load(await file.arrayBuffer(), {ignoreEncryption:true}); let links = '';
      for (const [a,b] of ranges) { const d = await PDFDocument.create();
        (await d.copyPages(src, Array.from({length:b-a+1},(_,i)=>a-1+i))).forEach(p=>d.addPage(p));
        links += dlLink(new Blob([await d.save()],{type:'application/pdf'}), `${baseName(file)}_${a===b?a:a+'-'+b}.pdf`); }
      out(`<p class="ok">${t('done')}</p>${links}`);
    } catch(e){ fail(e); }
  };
}

/* ---------- Compress ---------- */
function toolCompress(){
  shell('compress', `<p class="note">${t('compressNote')}</p><label for="lvl">${t('level')}</label>
   <select id="lvl"><option value="1.6,0.8">${t('lvlLow')}</option><option value="1.2,0.65" selected>${t('lvlMed')}</option><option value="0.9,0.45">${t('lvlHigh')}</option></select>` + dropZone('f',false,'application/pdf'));
  wireDrop('f', async ([f]) => { if (!f || !isPdf(f)) return out(`<p class="err">${t('needPdf')}</p>`);
    busy();
    try { const [scale, q] = $('#lvl').value.split(',').map(Number);
      await loadPdfjs(); await loadLib(); const pdf = await pdfjs.getDocument({ data: await f.arrayBuffer() }).promise; const doc = await PDFDocument.create();
      const cv = document.createElement('canvas'), ctx = cv.getContext('2d');
      for (let p=1;p<=pdf.numPages;p++){ const page = await pdf.getPage(p); const vp1 = page.getViewport({scale:1}); const vp = page.getViewport({scale});
        cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height); ctx.fillStyle='#fff'; ctx.fillRect(0,0,cv.width,cv.height);
        await page.render({canvasContext:ctx, viewport:vp}).promise;
        const jpg = await new Promise(r=>cv.toBlob(r,'image/jpeg',q)); const img = await doc.embedJpg(await jpg.arrayBuffer());
        doc.addPage([vp1.width, vp1.height]).drawImage(img,{x:0,y:0,width:vp1.width,height:vp1.height}); }
      const bytes = await doc.save(); const blob = new Blob([bytes],{type:'application/pdf'});
      const pct = Math.round((1-blob.size/f.size)*100);
      out(`<p>${t('before')}: <b>${kb(f.size)}</b> → ${t('after')}: <b>${kb(blob.size)}</b> ${pct>0?`(−${pct}%)`:''}</p>` +
        (blob.size >= f.size ? `<p class="err" id="notsmaller">${t('notSmaller')}</p>` : `<p class="ok">${t('done')}</p>${dlLink(blob, baseName(f)+'_compressed.pdf')}`));
    } catch(e){ fail(e); }
  });
}

/* ---------- Image to PDF ---------- */
function toolImg(){
  let files = [];
  shell('img', dropZone('f',true,'image/*') + `<ul class="list" id="lst"></ul><div class="row"><div><label for="ps">${t('pageSize')}</label><select id="ps"><option value="fit">${t('fit')}</option><option value="a4">${t('a4')}</option></select></div>
   <div><label for="mg">${t('margin')}</label><select id="mg"><option value="0">0</option><option value="20" selected>20 pt</option><option value="40">40 pt</option></select></div></div><p><button class="btn" id="go" disabled>${t('makePdf')}</button></p>`);
  const render = () => { $('#lst').innerHTML = files.map((f,i)=>`<li><span class="n">${i+1}. ${esc(f.name)}</span><button class="btn sm" data-a="u" data-i="${i}">↑</button><button class="btn sm" data-a="x" data-i="${i}">✕</button></li>`).join(''); $('#go').disabled = !files.length; };
  $('#lst').onclick = e => { const b = e.target.closest('button'); if(!b) return; const i=+b.dataset.i; if(b.dataset.a==='u'&&i>0)[files[i-1],files[i]]=[files[i],files[i-1]]; if(b.dataset.a==='x') files.splice(i,1); render(); };
  wireDrop('f', fs => { files = files.concat(fs.filter(f=>f.type.startsWith('image/'))); render(); out(files.length?'':`<p class="err">${t('needImg')}</p>`); });
  $('#go').onclick = async () => { busy();
    try { await loadLib(); const doc = await PDFDocument.create(); const m = +$('#mg').value;
      for (const f of files) { let img;
        if (f.type==='image/jpeg') img = await doc.embedJpg(await f.arrayBuffer());
        else if (f.type==='image/png') img = await doc.embedPng(await f.arrayBuffer());
        else { const bmp = await createImageBitmap(f); const c = document.createElement('canvas'); c.width=bmp.width; c.height=bmp.height; c.getContext('2d').drawImage(bmp,0,0);
          img = await doc.embedJpg(await (await new Promise(r=>c.toBlob(r,'image/jpeg',0.9))).arrayBuffer()); }
        let W,H; if ($('#ps').value==='a4'){ W=595.28; H=841.89; if (img.width>img.height){[W,H]=[H,W];} } else { W=img.width+2*m; H=img.height+2*m; }
        const s = Math.min((W-2*m)/img.width,(H-2*m)/img.height); const w=img.width*s, h=img.height*s;
        doc.addPage([W,H]).drawImage(img,{x:(W-w)/2,y:(H-h)/2,width:w,height:h}); }
      out(`<p class="ok">${t('done')} (${files.length} ${t('pages')})</p>${dlLink(new Blob([await doc.save()],{type:'application/pdf'}),'images.pdf')}`);
    } catch(e){ fail(e); } };
}

/* ---------- QR ---------- */
const vEsc = s => s.replace(/([\\;,])/g,'\\$1');
const wEsc = s => s.replace(/([\\;,":])/g,'\\$1');
function toolQr(){
  shell('qr', `<p class="note">${t('qrNote')}</p><div class="qrwrap"><div>
   <label for="qt">${t('qrType')}</label><select id="qt"><option value="url">${t('qrUrl')}</option><option value="text">${t('qrText')}</option><option value="wifi">${t('qrWifi')}</option><option value="vcard">${t('qrVcard')}</option></select>
   <div id="qf"></div><div class="row"><div><label for="fg">${t('fg')}</label><input type="color" id="fg" value="#000000"></div><div><label for="bgc">${t('bg')}</label><input type="color" id="bgc" value="#ffffff"></div>
   <div><label for="sz">${t('size')}</label><select id="sz"><option>512</option><option selected>1024</option><option>2048</option></select></div></div>
   <label for="logo">${t('logo')}</label><input type="file" id="logo" accept="image/*"> <button class="btn sm" id="nologo" type="button">${t('clearLogo')}</button></div>
   <div><canvas id="qrCanvas" width="300" height="300"></canvas><p><button class="btn" id="png">${t('png')}</button> <button class="btn" id="svg">${t('svg')}</button></p></div></div>`);
  const F = {
    url: `<label for="q_url">${t('url')}</label><input type="url" id="q_url" dir="ltr" value="https://example.com">`,
    text: `<label for="q_text">${t('text')}</label><textarea id="q_text" rows="3"></textarea>`,
    wifi: `<label for="q_ssid">${t('ssid')}</label><input type="text" id="q_ssid" dir="auto"><label for="q_pw">${t('password')}</label><input type="text" id="q_pw" dir="ltr">
      <label for="q_sec">${t('security')}</label><select id="q_sec"><option value="WPA">WPA/WPA2/WPA3</option><option value="WEP">WEP</option><option value="nopass">${t('none')}</option></select><label><input type="checkbox" id="q_hid"> ${t('hidden')}</label>`,
    vcard: ['fname','lname','phone','email','org','title','website'].map(k=>`<label for="q_${k}">${t(k)}</label><input type="${k==='email'?'email':k==='phone'?'tel':'text'}" id="q_${k}" dir="auto">`).join('')
  };
  let logoImg = null;
  const v = id => ($('#'+id)?.value || '').trim();
  const payload = () => { const ty = $('#qt').value;
    if (ty==='url') return v('q_url'); if (ty==='text') return $('#q_text').value;
    if (ty==='wifi') return `WIFI:T:${$('#q_sec').value};S:${wEsc(v('q_ssid'))};${$('#q_sec').value!=='nopass'?`P:${wEsc(v('q_pw'))};`:''}${$('#q_hid').checked?'H:true;':''};`;
    return ['BEGIN:VCARD','VERSION:3.0',`N:${vEsc(v('q_lname'))};${vEsc(v('q_fname'))};;;`,`FN:${vEsc((v('q_fname')+' '+v('q_lname')).trim())}`,
      v('q_org')&&`ORG:${vEsc(v('q_org'))}`, v('q_title')&&`TITLE:${vEsc(v('q_title'))}`, v('q_phone')&&`TEL;TYPE=CELL:${v('q_phone')}`,
      v('q_email')&&`EMAIL:${v('q_email')}`, v('q_website')&&`URL:${v('q_website')}`,'END:VCARD'].filter(Boolean).join('\r\n'); };
  const opts = () => ({ errorCorrectionLevel: logoImg ? 'H' : 'M', margin: 2, color: { dark: $('#fg').value, light: $('#bgc').value } });
  const drawLogo = (ctx, S) => { if (!logoImg) return; const w = S*0.22, x = (S-w)/2; ctx.fillStyle = $('#bgc').value; ctx.fillRect(x-S*0.015,x-S*0.015,w+S*0.03,w+S*0.03); ctx.drawImage(logoImg,x,x,w,w); };
  const draw = async (cv, S) => { const text = payload() || ' '; await QRCode.toCanvas(cv, text, { ...opts(), width: S }); drawLogo(cv.getContext('2d'), cv.width); };
  const refresh = async () => { try { await draw($('#qrCanvas'), 300); $('#qrCanvas').style.width=''; out(''); } catch(e){ fail(e); } };
  const setType = () => { $('#qf').innerHTML = F[$('#qt').value]; refresh(); };
  $('#qt').onchange = setType; app.addEventListener('input', e => { if (e.target.id !== 'logo' && e.target.id !== 'qt') refresh(); });
  $('#logo').onchange = async () => { const f = $('#logo').files[0]; if (!f) return; logoImg = await createImageBitmap(f); refresh(); };
  $('#nologo').onclick = () => { logoImg = null; $('#logo').value=''; refresh(); };
  const save = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); };
  $('#png').onclick = async () => { const c = document.createElement('canvas'); await draw(c, +$('#sz').value); c.toBlob(b => save(b,'qr-code.png'),'image/png'); };
  $('#svg').onclick = async () => { let s = await QRCode.toString(payload()||' ', { ...opts(), type: 'svg' });
    if (logoImg) { const vb = s.match(/viewBox="0 0 (\d+) (\d+)"/); const N = +vb[1]; const c = document.createElement('canvas'); c.width=c.height=256; c.getContext('2d').drawImage(logoImg,0,0,256,256);
      const w = N*0.22, x = (N-w)/2, pad = N*0.015;
      s = s.replace('</svg>', `<rect x="${x-pad}" y="${x-pad}" width="${w+2*pad}" height="${w+2*pad}" fill="${$('#bgc').value}"/><image href="${c.toDataURL('image/png')}" x="${x}" y="${x}" width="${w}" height="${w}"/></svg>`); }
    save(new Blob([s],{type:'image/svg+xml'}),'qr-code.svg'); };
  loadQr().then(setType);
}


/* ---------- Scanner ---------- */
function toolScan(){
  const pages = []; let S = null, cv = null;
  shell('scan', `<p class="note">${t('scanNote')}</p>
   <div class="drop" id="dz-f"><input type="file" id="cam" accept="image/*" capture="environment" hidden><input type="file" id="f" accept="image/*" multiple hidden>
   <button class="btn" type="button" id="camBtn">📷 ${t('takePhoto')}</button> <button class="btn" type="button" id="upBtn">🖼️ ${t('uploadImgs')}</button>
   <div>${t('drop')}</div><small>🔒 ${t('privateNote')}</small></div>
   <div id="editor" hidden><h3>${t('adjust')}</h3><p><small>${t('adjustHint')}</small></p><canvas id="ed" style="width:100%;max-width:640px;touch-action:none;border-radius:8px;background:#000"></canvas>
     <p><button class="btn" id="edOk">✓ ${t('applyCrop')}</button> <button class="btn sm" id="edAuto">${t('autoDetect')}</button> <button class="btn sm" id="edFull">${t('fullImage')}</button> <button class="btn sm" id="edCancel">${t('cancel')}</button></p></div>
   <ul class="list scan-list" id="lst"></ul>
   <div id="exp" hidden><div class="row"><div><label for="ps">${t('pageSize')}</label><select id="ps"><option value="a4">A4</option><option value="fit">${t('fit')}</option></select></div></div>
   <p><button class="btn" id="pdfBtn">⬇ ${t('exportPdf')}</button> <button class="btn" id="jpgBtn">⬇ ${t('exportJpg')}</button></p></div>`);
  $('#camBtn').onclick = () => $('#cam').click(); $('#upBtn').onclick = () => $('#f').click();
  const busyMsg = m => out(`<p>${m}</p>`);
  const ensureCv = async () => { if (!cv) { busyMsg(t('loadingScanner')); cv = await loadScanner().then(m => (S = m).loadCv()); } return cv; };
  const process = (pg) => { pg.warped = S.warp(cv, pg.src, pg.pts); pg.out = S.applyFilter(cv, pg.warped, pg.filter); };
  const add = async files => { files = files.filter(f => f.type.startsWith('image/')); if (!files.length) return out(`<p class="err">${t('needImg')}</p>`);
    try { await ensureCv(); busyMsg(t('processing'));
      for (const f of files) { const src = await S.fileToCanvas(f); const d = S.detectCorners(cv, src); const pg = { src, pts: d.pts, auto: d.auto, filter: 'enhance', name: f.name }; process(pg); pages.push(pg); }
      out(`<p class="ok">${t('done')}</p>`); render(); } catch (e) { fail(e); } };
  $('#cam').onchange = () => add([...$('#cam').files]); 
  const dz = $('#dz-f'); $('#f').onchange = () => add([...$('#f').files]);
  dz.ondragover = e => { e.preventDefault(); dz.classList.add('over'); }; dz.ondragleave = () => dz.classList.remove('over');
  dz.ondrop = e => { e.preventDefault(); dz.classList.remove('over'); add([...e.dataTransfer.files]); };
  const FL = ['color','gray','bw','enhance'];
  function render(){
    $('#lst').innerHTML = pages.map((p, i) => `<li data-i="${i}"><img src="${thumb(p.out)}" alt="${t('page')} ${i+1}" style="width:72px;height:auto;border:1px solid #cbd5e1;border-radius:4px">
      <span class="n">${t('page')} ${i+1}${p.auto ? '' : ` <small class="err">${t('noEdges')}</small>`}</span>
      <select data-a="f" data-i="${i}" aria-label="${t('filter')}">${FL.map(f => `<option value="${f}" ${p.filter===f?'selected':''}>${t('f_'+f)}</option>`).join('')}</select>
      <button class="btn sm" data-a="e" data-i="${i}">⤢ ${t('corners')}</button><button class="btn sm" data-a="u" data-i="${i}">↑</button><button class="btn sm" data-a="d" data-i="${i}">↓</button><button class="btn sm" data-a="x" data-i="${i}">✕ ${t('remove')}</button></li>`).join('');
    $('#exp').hidden = !pages.length;
  }
  const thumb = c => { const k = 160 / c.width, t2 = document.createElement('canvas'); t2.width = 160; t2.height = Math.round(c.height * k); t2.getContext('2d').drawImage(c, 0, 0, t2.width, t2.height); return t2.toDataURL('image/jpeg', 0.7); };
  $('#lst').onchange = e => { const sel = e.target.closest('select[data-a=f]'); if (!sel) return; const p = pages[+sel.dataset.i]; p.filter = sel.value; p.out = S.applyFilter(cv, p.warped, p.filter); render(); };
  $('#lst').onclick = e => { const b = e.target.closest('button'); if (!b) return; const i = +b.dataset.i;
    if (b.dataset.a==='u' && i>0) [pages[i-1],pages[i]]=[pages[i],pages[i-1]];
    if (b.dataset.a==='d' && i<pages.length-1) [pages[i+1],pages[i]]=[pages[i],pages[i+1]];
    if (b.dataset.a==='x') pages.splice(i,1);
    if (b.dataset.a==='e') return openEditor(i); render(); };
  // corner editor
  let ei = -1, pts = null, drag = -1; const ed = $('#ed'), ctx = ed.getContext('2d');
  function openEditor(i){ ei = i; pts = pages[i].pts.map(p => ({...p})); ed.width = pages[i].src.width; ed.height = pages[i].src.height; $('#editor').hidden = false; draw(); $('#editor').scrollIntoView({block:'start'}); }
  function draw(){ const src = pages[ei].src, r = Math.max(ed.width, ed.height) / 60; ctx.drawImage(src, 0, 0);
    ctx.fillStyle = 'rgba(15,118,110,.18)'; ctx.strokeStyle = '#14b8a6'; ctx.lineWidth = r / 3; ctx.beginPath(); pts.forEach((p, j) => j ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.fill(); ctx.stroke();
    pts.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke(); }); }
  const pos = e => { const b = ed.getBoundingClientRect(); return { x: (e.clientX - b.left) * ed.width / b.width, y: (e.clientY - b.top) * ed.height / b.height }; };
  ed.onpointerdown = e => { const q = pos(e); let m = 1e9; pts.forEach((p, j) => { const d = Math.hypot(p.x - q.x, p.y - q.y); if (d < m) { m = d; drag = j; } }); if (m > Math.max(ed.width, ed.height) / 8) drag = -1; else ed.setPointerCapture(e.pointerId); };
  ed.onpointermove = e => { if (drag < 0) return; const q = pos(e); pts[drag] = { x: Math.max(0, Math.min(ed.width, q.x)), y: Math.max(0, Math.min(ed.height, q.y)) }; draw(); };
  ed.onpointerup = () => { drag = -1; };
  $('#edAuto').onclick = () => { const d = S.detectCorners(cv, pages[ei].src); pts = d.pts; draw(); };
  $('#edFull').onclick = () => { const W = ed.width, H = ed.height; pts = [{x:0,y:0},{x:W,y:0},{x:W,y:H},{x:0,y:H}]; draw(); };
  $('#edCancel').onclick = () => { $('#editor').hidden = true; };
  $('#edOk').onclick = () => { const p = pages[ei]; p.pts = pts; p.auto = true; process(p); $('#editor').hidden = true; render(); };
  window.__scan = { pages, setCorners: (i, P) => { pages[i].pts = P; process(pages[i]); render(); } }; // QA hook
  const jpgBlob = c => new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
  $('#pdfBtn').onclick = async () => { busyMsg(t('processing'));
    try { await loadLib(); const doc = await PDFDocument.create();
      for (const p of pages) { const img = await doc.embedJpg(await (await jpgBlob(p.out)).arrayBuffer());
        let W, H; if ($('#ps').value === 'a4') { W = 595.28; H = 841.89; if (img.width > img.height) [W, H] = [H, W]; } else { W = img.width * 0.75; H = img.height * 0.75; }
        const s = Math.min(W / img.width, H / img.height); const w = img.width * s, h = img.height * s; doc.addPage([W, H]).drawImage(img, { x: (W - w) / 2, y: (H - h) / 2, width: w, height: h }); }
      out(`<p class="ok">${t('done')} (${pages.length} ${t('pages')})</p>${dlLink(new Blob([await doc.save()], { type: 'application/pdf' }), 'scan.pdf')}`);
    } catch (e) { fail(e); } };
  $('#jpgBtn').onclick = async () => { let h = ''; for (let i = 0; i < pages.length; i++) h += dlLink(await jpgBlob(pages[i].out), `scan_${i+1}.jpg`); out(`<p class="ok">${t('done')}</p>${h}`); };
}
const loadScanner = () => import('./scanner.js');


/* ---------- Background remover ---------- */
const loadBg = () => import('./bgremove.js');
function toolBg(){
  let B = null, M = null, cur = null; // cur: {src canvas, alpha Uint8, name}
  let bgImg = null;
  shell('bg', `<p class="note">${t('bgNote')}</p>
   <div class="row"><div><label for="mdl">${t('bgModel')}</label><select id="mdl"><option value="fast">${t('bgFast')}</option><option value="best">${t('bgBest')}</option></select></div></div>
   <p><small id="mdlInfo"></small></p>
   ${dropZone('f', true, 'image/*')}
   <div id="ed" hidden>
    <div class="row">
     <div><label for="preset">${t('bgPreset')}</label><select id="preset"><option value="none">${t('pNone')}</option><option value="product">${t('pProduct')}</option><option value="id">${t('pId')}</option><option value="sticker">${t('pSticker')}</option></select></div>
     <div id="idw" hidden><label for="idsz">${t('idSize')}</label><select id="idsz"><option value="600x600">2×2 in (US) 600×600</option><option value="413x531">35×45 mm (UK/EU/Schengen) 413×531</option><option value="472x591">40×50 mm 472×591</option><option value="390x567">33×48 mm (China/Gulf visas) 390×567</option></select></div>
     <div><label for="bgt">${t('bgType')}</label><select id="bgt"><option value="none">${t('bgTransparent')}</option><option value="color">${t('bgColor')}</option><option value="image">${t('bgImage')}</option><option value="blur">${t('bgBlur')}</option></select></div>
     <div><label for="bgc">${t('fg')}</label><input type="color" id="bgc" value="#ffffff"></div>
     <div><label for="bgi">${t('bgImage')}</label><input type="file" id="bgi" accept="image/*"></div>
    </div>
    <h3>${t('touchUp')}</h3><p><small>${t('touchHint')}</small></p>
    <div class="row"><div><label><input type="radio" name="bm" value="erase" checked> ${t('erase')}</label> <label><input type="radio" name="bm" value="restore"> ${t('restore')}</label></div>
     <div><label for="bs">${t('brush')}</label><input type="range" id="bs" min="4" max="200" value="40"></div><div><button class="btn sm" id="undo">↶ ${t('undo')}</button></div></div>
    <canvas id="cv" class="checker" style="width:100%;max-width:720px;touch-action:none;border-radius:8px"></canvas>
    <p><button class="btn" id="savePng">⬇ PNG</button> <button class="btn" id="saveJpg">⬇ JPG</button> <span id="dims"></span></p>
   </div>
   <div id="batch" hidden><h3>${t('batchTitle')}</h3><p id="batchMsg"></p></div>`);
  const info = async () => { B = B || await loadBg(); const p = await B.plan($('#mdl').value); $('#mdlInfo').textContent = `${p.gpu ? 'WebGPU' : 'WASM (CPU)'} · ${t('bgDownload')} ~${p.mb} MB${p.variant !== $('#mdl').value ? ' · ' + t('bgNoGpuBest') : ''}`; };
  $('#mdl').onchange = () => { M = null; info(); }; info();
  const ensure = async () => { B = B || await loadBg(); if (!M) { out(`<p>${t('bgLoading')}</p><progress id="pg" max="1" value="0" style="width:100%"></progress>`); M = await B.load($('#mdl').value, (l, n) => { const pg = $('#pg'); if (pg) pg.value = l / n; }); } return M; };
  const toCanvas = async f => { const b = await createImageBitmap(f, { imageOrientation: 'from-image' }); const c = document.createElement('canvas'); c.width = b.width; c.height = b.height; c.getContext('2d').drawImage(b, 0, 0); return c; };
  const cutout = (src, a) => { const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const g = c.getContext('2d'); g.drawImage(src, 0, 0); const d = g.getImageData(0, 0, c.width, c.height); for (let i = 0; i < a.length; i++) d.data[i*4+3] = a[i]; g.putImageData(d, 0, 0); return c; };
  const bbox = (a, w, h) => { let x0 = w, y0 = h, x1 = -1, y1 = -1; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (a[y*w+x] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return x1 < 0 ? { x: 0, y: 0, w, h } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }; };
  // Compose final full-resolution output according to preset + background.
  function compose(item, opts){
    const { src, alpha } = item, W = src.width, H = src.height, cut = cutout(src, alpha), preset = opts.preset;
    let bt = opts.bgt, col = opts.color;
    if (preset === 'product') { bt = 'color'; col = '#ffffff'; }
    if (preset === 'id') { bt = 'color'; }
    if (preset === 'sticker') bt = 'none';
    const fill = (g, w, h, dx = 0, dy = 0, sw = W, sh = H) => {
      if (bt === 'color') { g.fillStyle = col; g.fillRect(0, 0, w, h); }
      else if (bt === 'image' && bgImg) { const s = Math.max(w / bgImg.width, h / bgImg.height); g.drawImage(bgImg, (w - bgImg.width*s)/2, (h - bgImg.height*s)/2, bgImg.width*s, bgImg.height*s); }
      else if (bt === 'blur') { g.filter = `blur(${Math.round(Math.max(w, h) / 80)}px)`; g.drawImage(src, dx, dy, sw, sh); g.filter = 'none'; }
    };
    const c = document.createElement('canvas'), bb = bbox(alpha, W, H);
    if (preset === 'product') { // square, white, subject centred with 8% margin, at least original resolution
      const S = Math.max(bb.w, bb.h) / 0.84; c.width = c.height = Math.round(S); const g = c.getContext('2d'); fill(g, c.width, c.height);
      g.drawImage(cut, bb.x, bb.y, bb.w, bb.h, (S - bb.w)/2, (S - bb.h)/2, bb.w, bb.h); return c; }
    if (preset === 'id') { const [w, h] = opts.idsz.split('x').map(Number); c.width = w; c.height = h; const g = c.getContext('2d'); fill(g, w, h);
      // head-and-shoulders: subject width fills ~80%, top of head ~8% from top
      const s = Math.min(w * 0.8 / bb.w, h * 0.92 / bb.h); g.imageSmoothingQuality = 'high'; g.drawImage(cut, bb.x, bb.y, bb.w, bb.h, (w - bb.w*s)/2, h*0.08, bb.w*s, bb.h*s); return c; }
    if (preset === 'sticker') { const r = Math.max(4, Math.round(Math.max(bb.w, bb.h) / 60)), pad = r * 2;
      c.width = bb.w + pad*2; c.height = bb.h + pad*2; const g = c.getContext('2d');
      const sil = document.createElement('canvas'); sil.width = c.width; sil.height = c.height; const sg = sil.getContext('2d');
      sg.drawImage(cut, bb.x, bb.y, bb.w, bb.h, pad, pad, bb.w, bb.h); sg.globalCompositeOperation = 'source-in'; sg.fillStyle = '#ffffff'; sg.fillRect(0, 0, c.width, c.height);
      for (let k = 0; k < 24; k++) { const an = k / 24 * Math.PI * 2; g.drawImage(sil, Math.cos(an) * r, Math.sin(an) * r); }
      g.drawImage(cut, bb.x, bb.y, bb.w, bb.h, pad, pad, bb.w, bb.h); return c; }
    c.width = W; c.height = H; const g = c.getContext('2d'); fill(g, W, H); g.drawImage(cut, 0, 0); return c;
  }
  const opts = () => ({ preset: $('#preset').value, bgt: $('#bgt').value, color: $('#bgc').value, idsz: $('#idsz').value });
  const cv = $('#cv'), ctx = cv.getContext('2d'); let undo = [];
  function render(){ if (!cur) return; const o = opts(); $('#idw').hidden = o.preset !== 'id';
    const r = o.preset === 'none' ? compose(cur, o) : compose(cur, o); cv.width = r.width; cv.height = r.height; ctx.drawImage(r, 0, 0); $('#dims').textContent = `${r.width}×${r.height}px`; }
  ['preset','bgt','bgc','idsz'].forEach(id => $('#'+id).addEventListener('input', render));
  $('#bgi').onchange = async () => { const f = $('#bgi').files[0]; if (f) { bgImg = await createImageBitmap(f); $('#bgt').value = 'image'; render(); } };
  // touch-up brush works on the mask in source coordinates (only when no preset reframes the image)
  let painting = false;
  const brush = e => { if (!cur) return; if ($('#preset').value !== 'none') { $('#preset').value = 'none'; render(); }
    const b = cv.getBoundingClientRect(), x = (e.clientX - b.left) * cv.width / b.width, y = (e.clientY - b.top) * cv.height / b.height;
    const R = +$('#bs').value * cv.width / b.width / 2, v = document.querySelector('input[name=bm]:checked').value === 'erase' ? 0 : 255, W = cur.src.width, H = cur.src.height, a = cur.alpha;
    for (let yy = Math.max(0, y - R | 0); yy < Math.min(H, y + R); yy++) for (let xx = Math.max(0, x - R | 0); xx < Math.min(W, x + R); xx++) { const d = Math.hypot(xx - x, yy - y) / R; if (d < 1) { const k = d < 0.7 ? 1 : (1 - d) / 0.3, i = yy * W + xx; a[i] = Math.round(a[i] + (v - a[i]) * k); } }
    render(); };
  cv.onpointerdown = e => { if (!cur) return; undo.push(cur.alpha.slice()); if (undo.length > 15) undo.shift(); painting = true; cv.setPointerCapture(e.pointerId); brush(e); };
  cv.onpointermove = e => { if (painting) brush(e); }; cv.onpointerup = () => { painting = false; };
  $('#undo').onclick = () => { if (undo.length) { cur.alpha = undo.pop(); render(); } };
  const blobOf = (c, type) => new Promise(r => c.toBlob(r, type, 0.95));
  const save = async type => { const c = compose(cur, opts()); let src = c;
    if (type === 'image/jpeg') { src = document.createElement('canvas'); src.width = c.width; src.height = c.height; const g = src.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(c, 0, 0); }
    const b = await blobOf(src, type); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = baseName({ name: cur.name }) + (type === 'image/png' ? '_cutout.png' : '_cutout.jpg'); document.body.appendChild(a); a.click(); a.remove(); };
  $('#savePng').onclick = () => save('image/png'); $('#saveJpg').onclick = () => save('image/jpeg');
  const run = async files => { files = files.filter(f => f.type.startsWith('image/')); if (!files.length) return out(`<p class="err">${t('needImg')}</p>`);
    if (files.length > 1 && !isPro()) { out(`<p class="err">${t('batchPro')} <a href="#/pro">${t('proBtn')}</a></p>`); files = files.slice(0, 1); }
    try { const m = await ensure();
      if (files.length === 1) { const t0 = performance.now(); out(`<p>${t('processing')}</p>`); const src = await toCanvas(files[0]); let alpha; try { alpha = await B.segment(m, src); } catch (e) { if (m.device !== 'webgpu') throw e; console.warn('WebGPU run failed, retrying on CPU', e); B.disableGpu(); out(`<p>${t('processing')}</p>`); location.reload(); return; }
        cur = { src, alpha, name: files[0].name }; undo = []; $('#ed').hidden = false; render(); out(`<p class="ok">${t('done')} (${((performance.now()-t0)/1000).toFixed(1)} s, ${src.width}×${src.height}px)</p>`); return; }
      const JSZip = (await import('jszip')).default, zip = new JSZip(); $('#batch').hidden = false;
      for (let i = 0; i < files.length; i++) { $('#batchMsg').textContent = `${i+1} / ${files.length}…`; const src = await toCanvas(files[i]); const item = { src, alpha: await B.segment(m, src) };
        const c = compose(item, opts()); zip.file(baseName(files[i]) + '_cutout.png', await blobOf(c, 'image/png')); }
      $('#batchMsg').textContent = `${t('done')} ${files.length}`; out(dlLink(await zip.generateAsync({ type: 'blob' }), 'cutouts.zip'));
    } catch (e) { fail(e); } };
  wireDrop('f', run);
  window.__bg = { get cur(){ return cur; }, compose, opts, render }; // QA hook
}

/* ---------- Pro (placeholder, no payment) ---------- */
const sha256 = async txt => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt)))].map(b => b.toString(16).padStart(2, '0')).join('');
const isPro = () => localStorage.getItem('ntpro') === PRO_CODE_HASH;
function applyPro(){
  document.body.classList.toggle('is-pro', isPro());
  let bd = document.getElementById('proBadge');
  if (isPro()) { if (!bd) { bd = document.createElement('a'); bd.id = 'proBadge'; bd.href = '#/pro'; bd.className = 'pro-badge'; document.querySelector('.top nav').prepend(bd); } bd.textContent = '★ ' + t('proBadge'); }
  else if (bd) bd.remove();
}
function pro(){
  if (isPro()) { app.innerHTML = `<p><a href="#/">${t('back')}</a></p><div class="card pro" id="proThanks"><h1>★ ${t('proThanks')}</h1><p>${t('proThanksSub')}</p>
    <h3>${t('perksTitle')}</h3><ul>${[1,2,3].map(i=>`<li>${t('perk'+i)}</li>`).join('')}</ul></div>`; return; }
  app.innerHTML = `<p><a href="#/">${t('back')}</a></p><div class="card pro"><h1>${t('proTitle')}</h1><p>${t('proSub')}</p>
  <ul>${[1,2,3,4].map(i=>`<li>${t('pro'+i)}</li>`).join('')}</ul>
  ${PRO_URL ? `<a class="btn" id="proBtn" href="${PRO_URL}" target="_blank" rel="noopener">${t('proBtn')}</a>` : `<button class="btn" disabled id="proBtn">${t('proBtn')} (${t('proSoon')})</button>`}
  <form id="unlockForm" class="unlock"><label for="code">${t('codeLabel')}</label><div class="row"><input type="text" id="code" autocomplete="off" dir="ltr" placeholder="NTPRO-…"><button class="btn" type="submit">${t('unlock')}</button></div><p id="codeMsg" aria-live="polite"></p></form></div>`;
  $('#unlockForm').onsubmit = async e => { e.preventDefault(); const h = await sha256($('#code').value.trim().toUpperCase());
    if (h === PRO_CODE_HASH) { localStorage.setItem('ntpro', h); applyPro(); pro(); } else { $('#codeMsg').className = 'err'; $('#codeMsg').textContent = t('badCode'); } };
}

const ROUTES = { '': home, word: toolWord, merge: toolMerge, split: toolSplit, compress: toolCompress, img: toolImg, qr: toolQr, scan: toolScan, bg: toolBg, pro };
function route(){ const k = location.hash.replace(/^#\/?/, ''); (ROUTES[k] || home)(); window.scrollTo(0,0); }
window.addEventListener('hashchange', route);
applyLang();

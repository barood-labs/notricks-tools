import { PDFDocument } from 'pdf-lib'; import fs from 'fs';
const O='out/'; const exp={'merged.pdf':4,'split_1-2.pdf':2,'split_3.pdf':1,'images.pdf':3,'compressed.pdf':null};
for (const f of fs.readdirSync(O).filter(f=>f.endsWith('.pdf'))) { const k=Object.keys(exp).find(e=>f.endsWith(e)); const n=(await PDFDocument.load(fs.readFileSync(O+f))).getPageCount();
 console.log((exp[k]===null||exp[k]===n?'PASS':'FAIL'), f, n+'pages', (fs.statSync(O+f).size/1024|0)+'KB'); }

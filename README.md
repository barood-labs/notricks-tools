# No-Tricks Tools / أدوات بلا خدع
Bilingual (Arabic RTL + English) static site with private, in-browser tools: PDF to Word (text extraction), merge, split, compress, image to PDF, and a static QR generator (URL/text/Wi-Fi/vCard, PNG/SVG, colors, logo). Files are never uploaded.
- Dev: `npm i && npm run dev` · Build: `npm run build` (output in `dist/`, relative base, works on GitHub Pages)
- QA: `npm run preview` then `node qa/qa.mjs` (Playwright via system Chrome), `node qa/verify.mjs`
- Ads: empty labeled slots `[data-ad-slot]` in index.html (no ad network yet; add consent banner before enabling).
- Pro: placeholder only. TODO: set `PRO_CHECKOUT_URL` in `src/main.js` to a Gumroad/Lemon Squeezy link.
MIT licensed. Libraries: pdf-lib (MIT), pdf.js (Apache-2.0), docx (MIT), qrcode (MIT).

# QA report (2026-10-19). Playwright with system Chrome, 4 configs: en/ar × desktop 1280px / mobile 390px
Browser checks: 60/60 pass (qa/browser_results.json). Output verification: 20/20 PDFs page-count correct, 16/16 QR PNGs decode (jsQR), all .docx contain expected text.
- PDF→Word: EN text+headings+page breaks OK. Arabic (TrueType PDFs from Chrome and LibreOffice) extracted in correct RTL order with bidi paragraphs. Minor: an occasional wrapped fragment came out reversed, and in one case the lam-alef ligature was wrong. Arabic PDFs with Type3 fonts lose glyphs (pdf.js limitation). Scanned PDFs show an honest "no text / no OCR" message.
- Merge: 2 PDFs, reorder → 4 pages OK. Split: bad range rejected; "1-2, 3" (and Arabic comma ،) → 2 files OK.
- Compress: 16.88 MB image PDF → 206 KB (−99%). A small text PDF shows the "already optimized, keep original" message.
- Image→PDF: JPG+PNG+JPG, A4 → 3 pages OK.
- QR: URL/Wi-Fi(with escaping)/vCard(+Arabic name, custom color, logo, EC=H)/text(Arabic) PNG decode OK; SVG (with logo) generated.
- Pro button disabled placeholder (no payment). Privacy page OK. No JS errors, no horizontal overflow on mobile.

# QA report v2 (2026-10-19)
Playwright with system Chrome, 4 configs (en/ar × desktop 1280 / mobile 390), run locally and against the live site.
- Local: 116/116 checks pass. Live (https://barood-labs.github.io/notricks-tools/): 116/116 pass. Outputs: 20/20 PDFs correct page counts; 16/16 QR PNGs decode (jsQR); docx checks below.
- PDF→Word v2: Arabic wrapped lines are now in the correct order (presentation-form glyphs are detected as RTL). Layout: layout_en → heading, bold runs, indented paragraph, 3×3 table, 1 embedded image. layout_ar → RTL table, bold, lam-alef (لا، لأن) correct. Scanned PDF → page images placed in docx + honest "no text/OCR" notice.
- Landing pages: 6 tools × EN/AR return 200 with WebApplication, FAQPage, HowTo and Breadcrumb JSON-LD, correct dir, CTA opens tool. about/contact/terms/sitemap.xml/robots.txt return 200.
- Pro: button links to PRO_URL (src/config.js) https://payhip.com/b/n3kq7.

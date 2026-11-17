Fixtures for scripts/guards/ocr-read-guard.sh (S2, 2026-11-16). Synthetic documents for a fictional
nonprofit made for the intake rehearsal — never a client document.
- pledge-letter-scanned.pdf — one scanned page, no text layer (0.8° skew, slight blur)
- pledge-letter-known.txt — what the page says, line for line, after the parser's own normalization
  (an em dash reads " - ", as normalizeUnicodeArtifacts writes it for every document)
- blank-scan.pdf — one blank scanned page: recognition finds nothing
- two-scanned-pages.pdf — the letter twice, for the OCR page-cap check

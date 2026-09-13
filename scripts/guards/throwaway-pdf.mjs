// Throwaway PDF generator for scripts/guards/large-file-guard.sh: N text pages + one large incompressible
// binary stream. Never a client document. usage: node throwaway-pdf.mjs <out.pdf> <junkMiB> [pages]
import fs from "node:fs";
const [,, outPath, junkMiB, pages = "3"] = process.argv;
const objs = [];
const add = (body) => { objs.push(body); return objs.length; };
const fontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
const pageIds = [];
const contentIds = [];
for (let p = 1; p <= Number(pages); p++) {
  const lines = [];
  for (let l = 0; l < 30; l++) lines.push(`BT /F1 11 Tf 50 ${780 - l * 22} Td (Throwaway large-file probe page ${p} line ${l + 1}: families value clear eligibility information.) Tj ET`);
  const stream = lines.join("\n");
  contentIds.push(add(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`));
  pageIds.push(null);
}
const pagesId = objs.length + Number(pages) + 1;
for (let p = 0; p < Number(pages); p++) {
  pageIds[p] = add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentIds[p]} 0 R >>`);
}
const pagesObj = add(`<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
if (pagesObj !== pagesId) throw new Error("pages id mismatch");
const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
const junk = Buffer.alloc(Number(junkMiB) * 1024 * 1024);
for (let i = 0; i < junk.length; i += 1) junk[i] = (i * 2654435761) >>> 24; // incompressible-ish, deterministic
const junkId = add(null); // placeholder for the binary stream
const parts = []; const offsets = []; let pos = 0;
const push = (b) => { const buf = Buffer.isBuffer(b) ? b : Buffer.from(b, "latin1"); parts.push(buf); pos += buf.length; };
push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
objs.forEach((body, idx) => {
  offsets[idx + 1] = pos;
  if (body === null) { push(`${idx + 1} 0 obj\n<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length ${junk.length} >>\nstream\n`); push(junk); push("\nendstream\nendobj\n"); }
  else push(`${idx + 1} 0 obj\n${body}\nendobj\n`);
});
const xref = pos;
push(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`);
for (let i = 1; i <= objs.length; i++) push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
push(`trailer\n<< /Size ${objs.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
fs.writeFileSync(outPath, Buffer.concat(parts));
console.log(outPath, (pos / 1048576).toFixed(2), "MiB");

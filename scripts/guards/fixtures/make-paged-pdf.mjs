#!/usr/bin/env node
// SP-93 fixture generator: a valid, text-bearing PDF of exactly N pages, built from scratch so the
// partial-read guard needs no committed binary and no PDF library. Each page carries its own number
// so an extraction can be checked for WHICH pages it opened, not merely how many.
//
// Usage: node scripts/guards/fixtures/make-paged-pdf.mjs <out-path> <page-count>
import { writeFileSync } from "node:fs";

const outPath = process.argv[2];
const pageCount = Number(process.argv[3] || 40);
if (!outPath || !Number.isInteger(pageCount) || pageCount < 1) {
  console.error("usage: make-paged-pdf.mjs <out-path> <page-count>");
  process.exit(2);
}

const objects = [];           // 1-indexed; objects[i] is the body of object i+1
const add = (body) => { objects.push(body); return objects.length; };

const catalogNum = add(null); // reserved, filled once /Pages is known
const pagesNum = add(null);   // reserved
const fontNum = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

const kids = [];
for (let page = 1; page <= pageCount; page += 1) {
  // The marker is deliberately unambiguous per page: a read that stops early cannot fake the rest.
  const text = `Page ${page} of ${pageCount} - partial read fixture marker P${page}E`;
  const stream = `BT /F1 12 Tf 54 720 Td (${text}) Tj ET\n`;
  const contentNum = add(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
  const pageNum = add(
    `<< /Type /Page /Parent ${pagesNum} 0 R /MediaBox [0 0 612 792] ` +
    `/Resources << /Font << /F1 ${fontNum} 0 R >> >> /Contents ${contentNum} 0 R >>`,
  );
  kids.push(`${pageNum} 0 R`);
}

objects[catalogNum - 1] = `<< /Type /Catalog /Pages ${pagesNum} 0 R >>`;
objects[pagesNum - 1] = `<< /Type /Pages /Count ${pageCount} /Kids [${kids.join(" ")}] >>`;

let pdf = "%PDF-1.4\n";
const offsets = [];
objects.forEach((body, index) => {
  offsets.push(pdf.length);
  pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
});

const xrefStart = pdf.length;
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogNum} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

writeFileSync(outPath, Buffer.from(pdf, "latin1"));
console.log(`${outPath} ${pageCount} pages ${Buffer.byteLength(pdf, "latin1")} bytes`);

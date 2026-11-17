#!/usr/bin/env node
import http from "node:http";
import { createRequire } from "node:module";
import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withholdReason } from "./parser/xlsxWithhold.mjs";
import mammoth from "mammoth";
import JSZip from "jszip";

// N1b (2026-09-30): loopback default — was 0.0.0.0. Edge functions reach it at
// host.docker.internal:8789, which Docker Desktop proxies to the host loopback (proven against
// Ollama, itself 127.0.0.1-only). LOCAL_PARSER_HOST still overrides.
const HOST = process.env.LOCAL_PARSER_HOST || "127.0.0.1";
const PORT = Number(process.env.LOCAL_PARSER_PORT || 8789);
// Gate B (R1, 2026-09-19): every extraction reports the parser versions so a transcript record can store
// extraction_version — { server, pdfjs, mammoth } read once from the installed packages.
const require = createRequire(import.meta.url);
// S2 (2026-11-16): scanned pages are read by Apple Vision through a compiled helper
// (scripts/ocr/vision-ocr.swift, built by scripts/ocr/build-vision-ocr.sh). Its version is checked once,
// at boot, and stamped into versions.ocr — an OS update that changes Vision's model then shows as a new
// parser version, beside the SP-283 reuse check, and a sidecar is never silently re-read under it.
// THE PARSER'S LIMITS (T1, 2026-11-17) — every number that bounds a read, by name, in one place to look.
// A cap on TEXT exists exactly once (TEXT_CHAR_CAP); everything else here bounds TIME, PAGES, SHEETS,
// ROWS or the REQUEST, never the characters of a document. ingest-chunking-guard (c1) proves the text
// half BEHAVIOURALLY against the served parser, so a second text cap fails it however it is spelled.
//   TEXT_CHAR_CAP          350,000 characters — the one text cap, reported as chars_capped (SP-231, SP-267)
//   OCR_PAGE_CAP           200 OCR'd pages (Decision 7; env override for the guard's cap test only)
//   OCR_MIN_TEXT_CHARS     20 — below it a page with images is a scan (S2)
//   OCR_CALL_TIMEOUT_MS    2 minutes per helper call — a TIME limit, not a character cap
//   OCR_VERSION_TIMEOUT_MS 20 seconds for the boot-time version probe
//   XLSX_SHEET_CAP         50 sheets; XLSX_ROW_CAP 5,000 rows per sheet (S4, reported as rows_capped)
//   MAX_BODY_BYTES         35 MiB request body (env override)
const OCR_CALL_TIMEOUT_MS = 2 * 60 * 1000;
const OCR_VERSION_TIMEOUT_MS = 20 * 1000;
const OCR_BIN = process.env.VISION_OCR_BIN || path.join(path.dirname(fileURLToPath(import.meta.url)), "ocr", "bin", "vision-ocr");
const OCR_VERSION = (() => {
  try {
    const v = JSON.parse(execFileSync(OCR_BIN, ["--version"], { encoding: "utf8", timeout: OCR_VERSION_TIMEOUT_MS }));
    const macos = execFileSync("sw_vers", ["-productVersion"], { encoding: "utf8" }).trim();
    return `vision-rev${v.revision}-${(v.languages || []).join("+")}-macOS-${macos}`;
  } catch {
    return "unavailable";
  }
})();
const PARSER_VERSIONS = Object.freeze({
  // bumped for SP-93: the response shape gained pages_read / pages_total / chars_total, so a
  // stored extraction_version distinguishes a record that could say "partial" from one that could not.
  // Bumped again for SP-231 — and the suffix is load-bearing, not decoration. Both bumps happened on
  // 2026-11-13, so a date alone could not tell a 30-page read from a whole one, and a SIDECAR carries
  // no version of its own: the stored extraction_version on the proposal is the only record of which
  // parser wrote the text a later run reads. `-whole` is how a run says "this text is every page".
  server: "local-parser-server-2026-11-16-xlsx",
  ocr: OCR_VERSION,
  pdfjs: (() => { try { return String(require("pdfjs-dist/package.json").version); } catch { return "unknown"; } })(),
  mammoth: (() => { try { return String(require("mammoth/package.json").version); } catch { return "unknown"; } })(),
});
const MAX_BODY_BYTES = Number(process.env.LOCAL_PARSER_MAX_BODY_BYTES || 35 * 1024 * 1024);

function extensionFromName(name) {
  const parts = String(name || "").toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

function normalizeUnicodeArtifacts(text) {
  return String(text || "")
    .normalize("NFKC")
    .replace(/\u00ad/g, "")
    .replace(/[\u2000-\u200b\u202f\u205f\u3000]/g, " ")
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\u2013|\u2014/g, " - ")
    .replace(/\u2026/g, "...")
    .replace(/\t/g, " ");
}

// SP-231 (2026-11-13): THE ONE REMAINING CAP, and it no longer writes into the document.
//
// Two caps used to cut a read, and only one of them was ever discussed: PDF_PAGE_CAP stopped a PDF at
// 30 pages, and this function stopped EVERY path at 120,000 characters. Measured on the Charter 10-Q,
// 77 pages: 166,259 characters whole, 64,470 under the page cap — so lifting the page cap alone would
// have handed the character cap a 166k document and truncated it at 120k, a further 28% lost with
// nothing but a `[truncated]` string inside the text to say so.
//
// Two changes, together:
//   1. the cap is 350,000 characters (SP-267, lowered from 400,000; the queue is one-at-a-time
//      fleet-wide, so this is roughly 65 minutes of local extraction for one document);
//   2. NOTHING IS APPENDED TO THE TEXT. A marker inside the body is a sentence the document does not
//      contain: it would be windowed like any other text, could be quoted back as an evidence
//      excerpt, and is invisible to anything reading the row. Partiality is reported on the SHAPE
//      instead, by an EXPLICIT flag. Nothing read `[truncated]`; it was produced here and consumed
//      nowhere.
//
// AND THE FLAG HAS TO BE EXPLICIT, not inferred from the character counts. `chars_total > chars` was
// the obvious test and it is WRONG: this function also COMPACTS whitespace, so chars is below
// chars_total for essentially every document. Measured on the Charter 10-Q read whole:
// chars_total 166,259, chars 161,039 — a 5,220-character difference that is entirely compaction and
// not one character of lost content. Inferring partiality from that pair would mark every document
// partial. `chars_capped` is therefore reported on its own, set by the ONE line that drops text.
// SP-267 lowered this from 400,000 to bring the WINDOW COUNT down toward the 30 that a 10,000-char
// hand-off can give one excerpt each (SP-255, SP-256). It does not get there, and no character cap
// can: window count depends on BLOCK structure, not on characters. Measured on generated documents,
// 350,000 characters yields 32 windows at the 10-Q's own page density and 59 when blocks are just
// over half a window (a 6,001-char block cannot share a 12,000-char window, so it gets one of its
// own). The highest character cap that would guarantee 30 windows for ANY block structure is about
// 178,000 — only 10% above the 10-Q's own 161,039, which would re-create the truncation SP-231 was
// written to remove. Reported in I2-review.md; the construction-proof mechanism is a cap on WINDOWS,
// which is a separate behaviour change and is not taken here.
const TEXT_CHAR_CAP = 350_000;

/** The normalization, and whether the cap actually dropped anything. `capped` is the only loss. */
function normalizeTextCapped(text, maxChars = TEXT_CHAR_CAP) {
  const compact = normalizeUnicodeArtifacts(text)
    .replace(/\r/g, "\n")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (compact.length <= maxChars) return { text: compact, capped: false };
  return { text: compact.slice(0, maxChars).trimEnd(), capped: true };
}

// EXTRACTION SHAPE (ruling 8, 2026-09-14): every path reports chars (text read), images (images it did NOT
// read — no OCR exists), pages where the format knows them, and the parser path. An image-borne document
// is then distinguishable from a two-sentence one downstream.
const IMAGE_OPS = new Set(["paintImageXObject", "paintImageXObjectRepeat", "paintJpegXObject", "paintInlineImageXObject", "paintImageMaskXObject"]);

// SP-231 (2026-11-13): THE PAGE CAP IS GONE. SP-93 kept it because lifting it before chunking existed
// would have turned documents that analysed into documents that failed; chunking is this slice, so the
// read now opens every page the document has. pages_read is still reported beside pages_total — they
// are simply equal now for a PDF that parses, and the pair stays the honest way to say otherwise if a
// page ever fails to open.
// S2 (2026-11-16): A PAGE WITH IMAGES AND (ALMOST) NO TEXT LAYER IS A SCAN, and is read by Vision —
// page by page, so a mixed PDF keeps its text pages as they were and only its image pages are OCR'd.
// Both keep the [Page n] marker. An OCR'd page keeps its LINE BREAKS (one recognised line per line), so
// the sidecar reads line for line like the page; a text-layer page reads as before.
// THE OCR CAP: 200 OCR'd pages (operator ruling, Decision 7). Past it the read stops, pages_read <
// pages_total, and S-ING-1 says so — the existing partial-read honesty, no new string.
const OCR_MIN_TEXT_CHARS = 20;
const OCR_PAGE_CAP = Number(process.env.LOCAL_PARSER_OCR_PAGE_CAP || 200);   // env override exists for the guard's cap test only
const execFileP = (cmd, args) => new Promise((resolve, reject) => {
  execFile(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: OCR_CALL_TIMEOUT_MS }, (err, stdout) => (err ? reject(err) : resolve(stdout)));
});
/** Vision's lines for each image path, in order; an image it could not load reads as no lines. */
async function ocrImageFiles(paths) {
  const out = JSON.parse(await execFileP(OCR_BIN, paths));
  return (out.images || []).map((img) => (img.lines || []).map((l) => String(l.text || "")).filter(Boolean).join("\n"));
}
const STANDARD_FONTS = (() => {
  try { return path.join(path.dirname(require.resolve("pdfjs-dist/package.json")), "standard_fonts") + path.sep; } catch { return undefined; }
})();

async function ocrPdfPage(pdfPage) {
  const { createCanvas } = await import("@napi-rs/canvas");
  const vp = pdfPage.getViewport({ scale: 300 / 72 });
  const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
  await pdfPage.render({ canvasContext: canvas.getContext("2d"), viewport: vp, canvas }).promise;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ocr-page-"));
  const file = path.join(dir, "page.png");
  try {
    fs.writeFileSync(file, canvas.toBuffer("image/png"));
    return (await ocrImageFiles([file]))[0] ?? "";
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function extractPdfText(buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(buffer), disableWorker: true, standardFontDataUrl: STANDARD_FONTS });
  const doc = await task.promise;
  const pagesTotal = doc.numPages;
  let pagesRead = pagesTotal;
  const chunks = [];
  let images = 0;
  let ocrPages = 0;
  let ocrUnavailable = false;
  const opNames = new Map(Object.entries(pdfjs.OPS).map(([name, code]) => [code, name]));
  for (let page = 1; page <= pagesTotal; page += 1) {
    const p = await doc.getPage(page);
    const content = await p.getTextContent();
    const text = content.items
      .map((item) => (item && typeof item === "object" && "str" in item ? String(item.str || "") : ""))
      .filter(Boolean)
      .join(" ");
    let pageImages = 0;
    try {
      const ops = await p.getOperatorList();
      for (const fn of ops.fnArray) if (IMAGE_OPS.has(opNames.get(fn))) pageImages += 1;
    } catch {
      // image count is best-effort; text extraction is the authority
    }
    images += pageImages;
    if (text.trim().length < OCR_MIN_TEXT_CHARS && pageImages > 0) {
      if (OCR_VERSION === "unavailable") {
        ocrUnavailable = true;
      } else if (ocrPages >= OCR_PAGE_CAP) {
        pagesRead = page - 1;     // the cap: stop here, and let pages_read < pages_total say so
        break;
      } else {
        const ocrText = (await ocrPdfPage(p)).trim();
        ocrPages += 1;
        if (ocrText) { chunks.push(`[Page ${page}] ${ocrText}`); continue; }
      }
    }
    if (text.trim()) chunks.push(`[Page ${page}] ${text.trim()}`);
  }
  // Was `pages: doc.numPages` — the DOCUMENT's count returned beside text covering only the first 30
  // of them, so a 77-page filing recorded "77 pages" for a 30-page read (SP-93). Both are now the
  // same number because the read is whole; the pair is kept because it is what makes a short read
  // sayable at all.
  const joined = chunks.join("\n\n");
  const normalized = normalizeTextCapped(joined);
  return { text: normalized.text, images, pagesRead, pagesTotal, charsTotal: joined.length, charsCapped: normalized.capped, ocrPages, ocrUnavailable };
}

async function extractDocxText(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  let images = 0;
  try {
    const zip = await JSZip.loadAsync(buffer);
    images = Object.keys(zip.files).filter((name) => /^word\/media\//.test(name) && !zip.files[name].dir).length;
  } catch {
    // not a readable package: mammoth already parsed the text; image count unknown → 0
  }
  const raw = String(result.value || "");
  const normalized = normalizeTextCapped(raw);
  return { text: normalized.text, images, pagesRead: null, pagesTotal: null, charsTotal: raw.length, charsCapped: normalized.capped };
}

// S0 (2026-11-16): A FILE THAT CANNOT BE READ SAYS WHY. Every path that used to return empty text —
// or threw, and reached the caller as a 500 — now returns `unreadable: { code }` beside the empty text,
// so analyze-file can record the code on the file and the operator is shown the signed reason instead
// of a bare "Analysis failed". The codes are the ones src/lib/ingest/ingestStrings.ts UNREADABLE_STRINGS
// renders. OCR does not exist yet (S2), so a PDF of scanned pages, or an image, is `unreadable_format`.
const CFB_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
/** An Office file saved with a password is an encrypted CFB container, not a zip. */
const isCfbContainer = (buffer) => buffer.length >= 8 && buffer.subarray(0, 8).equals(CFB_MAGIC);
const OOXML_EXT = new Set(["docx", "xlsx", "pptx", "docm", "xlsm", "pptm"]);

function pdfErrorCode(error) {
  const name = String(error?.name || "");
  if (name === "PasswordException") return "unreadable_password";
  return "unreadable_corrupt";
}

// S6 (2026-11-16): A POWERPOINT (.pptx) is read slide by slide, in the deck's own order
// (ppt/presentation.xml <p:sldIdLst> through its relationships), each paragraph a line. Every slide is
// marked [Slide n of m]; a HIDDEN slide (show="0") is read and marked [Slide n of m, hidden] (operator
// ruling: read and label); its speaker notes follow as [Slide n of m, notes] — markers, never words the
// deck does not contain. Pictures are not read; they are counted into `images` as everywhere else.
// slides_read / slides_total ride the existing pages_read / pages_total pair with page_unit "slide":
// a slide that will not parse stops the read there, so "Only the first n of m slides were read." is
// literally true.
async function extractPptxText(buffer) {
  const { DOMParser } = await import("@xmldom/xmldom");
  const zip = await JSZip.loadAsync(buffer);
  const read = async (p) => { const f = zip.file(p); return f ? f.async("string") : null; };
  const parse = (xml) => new DOMParser({ onError: () => {} }).parseFromString(xml, "text/xml");
  const resolve = (base, target) => {
    const parts = base.split("/").slice(0, -1);
    for (const seg of target.split("/")) { if (seg === "..") parts.pop(); else if (seg && seg !== ".") parts.push(seg); }
    return parts.join("/");
  };
  const relsOf = async (part) => {
    const xml = await read(part.replace(/([^/]+)$/, "_rels/$1.rels"));
    const out = [];
    if (!xml) return out;
    const els = parse(xml).getElementsByTagName("Relationship");
    for (let i = 0; i < els.length; i += 1) out.push({ id: els[i].getAttribute("Id"), type: els[i].getAttribute("Type") || "", target: resolve(part, els[i].getAttribute("Target") || "") });
    return out;
  };
  const paragraphs = (node) => {
    const lines = [];
    const ps = node.getElementsByTagName("a:p");
    for (let i = 0; i < ps.length; i += 1) {
      const ts = ps[i].getElementsByTagName("a:t");
      let line = "";
      for (let j = 0; j < ts.length; j += 1) line += ts[j].textContent || "";
      if (line.trim()) lines.push(line.trim());
    }
    return lines;
  };
  const presXml = await read("ppt/presentation.xml");
  if (!presXml) throw new Error("not a presentation");
  const presRels = new Map((await relsOf("ppt/presentation.xml")).map((r) => [r.id, r.target]));
  const ids = parse(presXml).getElementsByTagName("p:sldId");
  const total = ids.length;
  const blocks = [];
  let slidesRead = 0;
  for (let i = 0; i < total; i += 1) {
    const n = i + 1;
    const partPath = presRels.get(ids[i].getAttribute("r:id"));
    try {
      const xml = partPath ? await read(partPath) : null;
      if (!xml) throw new Error("missing slide");
      const doc = parse(xml);
      const root = doc.documentElement;
      if (!root || root.tagName !== "p:sld") throw new Error("not a slide");
      const hidden = root.getAttribute("show") === "0";
      const lines = paragraphs(doc);
      let block = `[Slide ${n} of ${total}${hidden ? ", hidden" : ""}]` + (lines.length ? ` ${lines.join("\n")}` : "");
      const notesRel = (await relsOf(partPath)).find((r) => r.type.endsWith("/notesSlide"));
      if (notesRel) {
        const notesXml = await read(notesRel.target);
        if (notesXml) {
          // only the notes BODY: not the slide-image or slide-number placeholders
          const nd = parse(notesXml);
          const sps = nd.getElementsByTagName("p:sp");
          const notes = [];
          for (let k = 0; k < sps.length; k += 1) {
            const ph = sps[k].getElementsByTagName("p:ph")[0];
            if (ph && ph.getAttribute("type") === "body") notes.push(...paragraphs(sps[k]));
          }
          if (notes.length) block += `\n[Slide ${n} of ${total}, notes] ${notes.join("\n")}`;
        }
      }
      blocks.push(block);
      slidesRead += 1;
    } catch {
      break;   // stop at the first slide that will not read: "the first n of m" stays literally true
    }
  }
  const images = Object.keys(zip.files).filter((name) => /^ppt\/media\//.test(name) && !zip.files[name].dir).length;
  const joined = blocks.join("\n\n");
  const hasText = blocks.some((b) => b.replace(/\[Slide [^\]]+\]/g, "").trim());
  const normalized = normalizeTextCapped(joined);
  return { text: hasText ? normalized.text : "", images, slidesRead, slidesTotal: total, charsTotal: joined.length, charsCapped: normalized.capped };
}

// S4 (2026-11-16): A SPREADSHEET (.xlsx) is read sheet by sheet in the workbook's order, every row as
// "Header: value" pairs so a quote carries its column. Formula cells give their CACHED value (a formula is
// never evaluated; with no saved value it reads "(formula, no saved value)"); a number whose cell format is
// a date reads as ISO YYYY-MM-DD; a merged range keeps its value under the top-left cell, as the file does.
// The header row is the first non-empty row, unless it is mostly numbers (then column letters).
// HIDDEN sheets are read and labelled (operator ruling). Rows go out in blocks of ROW_BLOCK under a
// [Sheet i of n: name, rows a-b] marker so the windower can cut a long sheet; caps: 50 sheets (pages_read
// / pages_total with page_unit "sheet") and 5,000 rows per sheet (rows_capped, per sheet).
// PERSONAL COLUMNS ARE WITHHELD BEFORE ANYTHING IS WRITTEN (scripts/parser/xlsxWithhold.mjs, signed): their
// header and cells never reach the sidecar; the sheet's block carries a marker naming the withheld headers.
const XLSX_SHEET_CAP = 50;
const XLSX_ROW_CAP = 5000;
const XLSX_ROW_BLOCK = 70;
const BUILTIN_DATE_FMTS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
const colLetters = (ref) => String(ref || "").replace(/\d+$/, "");
const colIndex = (letters) => letters.split("").reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
const colName = (i) => { let s = ""; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
function excelSerialToIso(serial) {
  const ms = Math.round((Number(serial) - 25569) * 86400 * 1000);   // 1900 system; serials past 60 skip the leap bug
  const d = new Date(ms);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : String(serial);
}
async function extractXlsxText(buffer) {
  const { DOMParser } = await import("@xmldom/xmldom");
  const zip = await JSZip.loadAsync(buffer);
  const read = async (p) => { const f = zip.file(p); return f ? f.async("string") : null; };
  const parse = (xml) => new DOMParser({ onError: () => {} }).parseFromString(xml, "text/xml");
  const all = (node, tag) => Array.from(node.getElementsByTagName(tag));
  const wbXml = await read("xl/workbook.xml");
  if (!wbXml) throw new Error("not a workbook");
  const rels = new Map();
  const relsXml = await read("xl/_rels/workbook.xml.rels");
  if (relsXml) for (const r of all(parse(relsXml), "Relationship")) {
    const t = r.getAttribute("Target") || "";
    rels.set(r.getAttribute("Id"), t.startsWith("/") ? t.slice(1) : "xl/" + t.replace(/^\.\//, ""));
  }
  const shared = [];
  const ssXml = await read("xl/sharedStrings.xml");
  if (ssXml) for (const si of all(parse(ssXml), "si")) shared.push(all(si, "t").map((t) => t.textContent || "").join(""));
  // which cell styles are dates: built-in date formats, or a custom format code with d / m / y and no 0.00
  const dateStyles = new Set();
  const stXml = await read("xl/styles.xml");
  if (stXml) {
    const st = parse(stXml);
    const custom = new Map(all(st, "numFmt").map((f) => [Number(f.getAttribute("numFmtId")), String(f.getAttribute("formatCode") || "")]));
    const xfsNode = all(st, "cellXfs")[0];
    if (xfsNode) all(xfsNode, "xf").forEach((xf, i) => {
      const id = Number(xf.getAttribute("numFmtId") || 0);
      const code = custom.get(id) || "";
      const isDate = BUILTIN_DATE_FMTS.has(id) || (/[dmy]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]/g, "")) && !/0\.0|#/.test(code));
      if (isDate) dateStyles.add(i);
    });
  }
  const sheets = all(parse(wbXml), "sheet");
  const total = sheets.length;
  const blocks = [];
  const rowsCapped = [];
  const withheld = [];
  let sheetsRead = 0;
  for (let si = 0; si < Math.min(total, XLSX_SHEET_CAP); si += 1) {
    const sh = sheets[si];
    const name = String(sh.getAttribute("name") || `Sheet${si + 1}`).replace(/[\]\n]/g, " ");
    const hidden = /hidden/i.test(String(sh.getAttribute("state") || ""));
    const xml = await read(rels.get(sh.getAttribute("r:id")) || "");
    sheetsRead += 1;
    const label = `${si + 1} of ${total}: ${name}${hidden ? " (hidden)" : ""}`;
    if (!xml) { blocks.push(`[Sheet ${label}] (sheet could not be read)`); continue; }
    // rows → { rowNumber, cells: Map(colIndex → text) }
    const grid = [];
    for (const row of all(parse(xml), "row")) {
      const cells = new Map();
      for (const c of all(row, "c")) {
        const t = c.getAttribute("t") || "";
        const v = c.getElementsByTagName("v")[0];
        const f = c.getElementsByTagName("f")[0];
        let text = "";
        if (t === "s") text = shared[Number(v?.textContent ?? -1)] ?? "";
        else if (t === "inlineStr") text = all(c, "t").map((x) => x.textContent || "").join("");
        else if (t === "b") text = v ? (v.textContent === "1" ? "TRUE" : "FALSE") : "";
        else if (v && v.textContent !== "") {
          const raw = v.textContent;
          const style = Number(c.getAttribute("s") ?? -1);
          text = (t === "" || t === "n") && dateStyles.has(style) && /^-?\d+(\.\d+)?$/.test(raw) ? excelSerialToIso(raw) : raw;
        } else if (f) text = "(formula, no saved value)";
        text = String(text).replace(/\s+/g, " ").trim();
        if (text) cells.set(colIndex(colLetters(c.getAttribute("r"))), text);
      }
      if (cells.size) grid.push({ r: Number(row.getAttribute("r") || grid.length + 1), cells });
    }
    if (!grid.length) { blocks.push(`[Sheet ${label}] (empty)`); continue; }
    const first = grid[0];
    const numeric = [...first.cells.values()].filter((x) => /^-?[\d.,]+$/.test(x)).length;
    const useLetters = numeric * 2 > first.cells.size;
    const body = useLetters ? grid : grid.slice(1);
    const maxCol = Math.max(...grid.map((g) => Math.max(...g.cells.keys())));
    const headerOf = (i) => (useLetters ? colName(i) : (first.cells.get(i) || colName(i)));
    // withholding, per column, BEFORE any row is written
    const kept = [];
    const gone = [];
    for (let i = 0; i <= maxCol; i += 1) {
      const reason = withholdReason(useLetters ? "" : headerOf(i), body.map((g) => g.cells.get(i)));
      if (reason) gone.push({ header: headerOf(i), reason }); else kept.push(i);
    }
    if (gone.length) withheld.push(...gone.map((g) => ({ sheet: name, header: g.header, reason: g.reason })));
    const capped = body.slice(0, XLSX_ROW_CAP);
    if (body.length > XLSX_ROW_CAP) rowsCapped.push({ sheet: name, read: XLSX_ROW_CAP, total: body.length });
    const head = `[Sheet ${label}] ${body.length} rows x ${kept.length} columns`
      + (gone.length ? `\n[Sheet ${label}, columns withheld] ${gone.map((g) => g.header).join(", ")}` : "");
    const lines = capped.map((g) => {
      const pairs = kept.filter((i) => g.cells.has(i)).map((i) => `${headerOf(i)}: ${g.cells.get(i)}`);
      return pairs.length ? `Row ${g.r}: ${pairs.join(" | ")}` : null;
    }).filter(Boolean);
    if (lines.length <= XLSX_ROW_BLOCK) { blocks.push([head, ...lines].join("\n")); continue; }
    blocks.push(head);
    for (let b = 0; b < lines.length; b += XLSX_ROW_BLOCK) {
      const chunk = lines.slice(b, b + XLSX_ROW_BLOCK);
      const a = chunk[0].match(/^Row (\d+)/)?.[1], z = chunk[chunk.length - 1].match(/^Row (\d+)/)?.[1];
      blocks.push([`[Sheet ${label}, rows ${a}-${z}]`, ...chunk].join("\n"));
    }
  }
  const images = Object.keys(zip.files).filter((n) => /^xl\/media\//.test(n) && !zip.files[n].dir).length;
  const joined = blocks.join("\n\n");
  const normalized = normalizeTextCapped(joined);
  const hasRows = /(^|\n)Row \d+: /.test(joined);
  return { text: hasRows ? normalized.text : "", images, sheetsRead, sheetsTotal: total, charsTotal: joined.length, charsCapped: normalized.capped, rowsCapped, withheld };
}

async function extractText({ fileName, fileType, contentBase64 }) {
  const buffer = Buffer.from(String(contentBase64 || ""), "base64");
  const ext = extensionFromName(fileName);
  const normalizedType = String(fileType || "").toLowerCase();
  // SP-93, amended by SP-231: the shape says what was READ and what EXISTS, separately.
  //   chars        — characters in the `text` field: after whitespace compaction AND after the cap
  //   chars_total  — characters the source yielded before either, over the pages this read opened.
  //                  UNCHANGED in meaning from SP-93, so stored rows keep theirs.
  //   chars_capped — SP-231: true only when the 400,000-character cap actually dropped text. It is
  //                  NOT `chars_total > chars`: compaction makes that true for nearly every
  //                  document (Charter 10-Q read whole: 166,259 → 161,039, all compaction).
  //   pages_read   — pages this extraction opened (null where the format has no pages). Equal to
  //                  pages_total now that the page cap is gone; the pair stays because it is what
  //                  makes a page that fails to open sayable.
  //   pages_total  — pages the document has (null likewise)
  //   pages        — retained, and now EXPLICITLY the document's count: it is what the stored
  //                  extraction_pages column has always meant, so old rows keep their meaning
  const shaped = ({ text, source, images = 0, pagesRead = null, pagesTotal = null, charsTotal = null, charsCapped = false, ocrPages = 0, pageUnit = "page", rowsCapped = [], withheldColumns = [] }) => ({
    text,
    source,
    chars: text.length,
    chars_total: charsTotal ?? text.length,
    // SP-231: set by the cap itself, never inferred from chars vs chars_total (that pair also
    // differs by whitespace compaction, which loses nothing).
    chars_capped: charsCapped,
    images,
    pages: pagesTotal,
    pages_read: pagesRead,
    pages_total: pagesTotal,
    // S2: how many pages were read by text recognition (S-ING-7 renders when it is above 0).
    ocr_pages: ocrPages,
    // S6: what pages_read / pages_total count — "page" (PDF) or "slide" (PowerPoint).
    page_unit: pageUnit,
    // S4: per sheet, rows read of rows present when the 5,000-row cap bit; and the columns withheld.
    rows_capped: rowsCapped,
    withheld_columns: withheldColumns,
    versions: PARSER_VERSIONS,
    unreadable: null,
  });
  /** S0: empty text plus the reason it is empty. */
  const unreadable = (code, source, extra = {}) => ({
    ...shaped({ text: "", source, charsTotal: 0, ...extra }),
    unreadable: { code },
  });

  if (buffer.length === 0) return unreadable("unreadable_empty", "empty_file");

  const isText =
    normalizedType.startsWith("text/") ||
    normalizedType.includes("json") ||
    normalizedType.includes("csv") ||
    ["txt", "csv", "md", "json", "xml", "yaml", "yml", "toml", "vtt", "srt"].includes(ext);
  if (isText) {
    const raw = buffer.toString("utf8");
    const normalized = normalizeTextCapped(raw);
    if (!normalized.text) return unreadable("unreadable_empty", "local_text_reader");
    return shaped({ text: normalized.text, source: "local_text_reader", charsTotal: raw.length, charsCapped: normalized.capped });
  }

  const isPdf = normalizedType.includes("pdf") || ext === "pdf";
  if (isPdf) {
    let read;
    try {
      read = await extractPdfText(buffer);
    } catch (error) {
      return unreadable(pdfErrorCode(error), "local_parser_pdfjs");
    }
    const { text, images, pagesRead, pagesTotal, charsTotal, charsCapped, ocrPages, ocrUnavailable } = read;
    if (!text) {
      // S2: a scan whose recognition found nothing, a scan with no recognition available, or a document
      // with genuinely nothing in it.
      const code = ocrUnavailable ? "ocr_unavailable"
        : ocrPages > 0 ? "unreadable_no_text_after_ocr"
        : images > 0 ? "unreadable_format"
        : "unreadable_empty";
      return unreadable(code, "local_parser_pdfjs", { images, pagesRead, pagesTotal, ocrPages });
    }
    return shaped({ text, source: ocrPages > 0 ? "local_parser_pdfjs_ocr" : "local_parser_pdfjs", images, pagesRead, pagesTotal, charsTotal, charsCapped, ocrPages });
  }

  // S3 (2026-11-16): an IMAGE (png, jpg, webp) goes straight to the same Vision helper as a scanned page.
  // One block, marked [Image 1 of 1]; its lines keep their breaks. Counted as one recognised page, so
  // S-ING-7 says the text was read by text recognition.
  const isImage = /^image\/(png|jpe?g|webp)$/.test(normalizedType) || ["png", "jpg", "jpeg", "webp"].includes(ext);
  if (isImage) {
    if (OCR_VERSION === "unavailable") return unreadable("ocr_unavailable", "local_ocr_image");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ocr-image-"));
    let recognised = "";
    try {
      const file = path.join(dir, `image.${ext || "png"}`);
      fs.writeFileSync(file, buffer);
      const out = JSON.parse(await execFileP(OCR_BIN, [file]));
      const img = (out.images || [])[0] || {};
      if (img.error) return unreadable("unreadable_corrupt", "local_ocr_image");   // the image would not load
      recognised = (img.lines || []).map((l) => String(l.text || "")).filter(Boolean).join("\n").trim();
    } catch {
      return unreadable("unreadable_corrupt", "local_ocr_image");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    if (!recognised) return unreadable("unreadable_no_text_after_ocr", "local_ocr_image", { ocrPages: 1 });
    const raw = `[Image 1 of 1] ${recognised}`;
    const normalized = normalizeTextCapped(raw);
    return shaped({ text: normalized.text, source: "local_ocr_image", charsTotal: raw.length, charsCapped: normalized.capped, ocrPages: 1 });
  }

  // An encrypted Office file is a CFB container whatever its extension says.
  if (OOXML_EXT.has(ext) && isCfbContainer(buffer)) return unreadable("unreadable_password", "office_encrypted");

  const isDocx =
    normalizedType.includes("officedocument.wordprocessingml.document") || ext === "docx";
  if (isDocx) {
    let read;
    try {
      read = await extractDocxText(buffer);
    } catch {
      return unreadable("unreadable_corrupt", "local_parser_mammoth");
    }
    const { text, images, pagesRead, pagesTotal, charsTotal, charsCapped } = read;
    if (!text) return unreadable(images > 0 ? "unreadable_format" : "unreadable_empty", "local_parser_mammoth", { images });
    return shaped({ text, source: "local_parser_mammoth", images, pagesRead, pagesTotal, charsTotal, charsCapped });
  }

  const isXlsx = normalizedType.includes("officedocument.spreadsheetml.sheet") || ext === "xlsx";
  if (isXlsx) {
    let read;
    try {
      read = await extractXlsxText(buffer);
    } catch {
      return unreadable("unreadable_corrupt", "local_parser_xlsx");
    }
    const { text, images, sheetsRead, sheetsTotal, charsTotal, charsCapped, rowsCapped, withheld } = read;
    if (!text) return unreadable("unreadable_empty", "local_parser_xlsx", { images, pagesRead: sheetsRead, pagesTotal: sheetsTotal, pageUnit: "sheet" });
    return shaped({ text, source: "local_parser_xlsx", images, pagesRead: sheetsRead, pagesTotal: sheetsTotal, charsTotal, charsCapped, pageUnit: "sheet", rowsCapped, withheldColumns: withheld });
  }

  const isPptx = normalizedType.includes("officedocument.presentationml.presentation") || ext === "pptx";
  if (isPptx) {
    let read;
    try {
      read = await extractPptxText(buffer);
    } catch {
      return unreadable("unreadable_corrupt", "local_parser_pptx");
    }
    const { text, images, slidesRead, slidesTotal, charsTotal, charsCapped } = read;
    if (!text) return unreadable(images > 0 ? "unreadable_format" : "unreadable_empty", "local_parser_pptx", { images, pagesRead: slidesRead, pagesTotal: slidesTotal, pageUnit: "slide" });
    return shaped({ text, source: "local_parser_pptx", images, pagesRead: slidesRead, pagesTotal: slidesTotal, charsTotal, charsCapped, pageUnit: "slide" });
  }

  // S5 (2026-11-16): an old Word .doc is read by macOS's own textutil (nothing installed). A file textutil
  // cannot open — damaged, or saved with a password — closes unreadable_corrupt; the two cannot be told
  // apart from outside. No page counts, the same as .docx.
  const isDoc = normalizedType === "application/msword" || ext === "doc";
  if (isDoc) {
    // A real .doc is a CFB container (some are RTF). textutil reads ANY file as plain text, so anything
    // else named .doc is not opened at all — it would otherwise "read" its own garbage.
    const isRtf = buffer.subarray(0, 5).toString("latin1") === "{\\rtf";
    if (!isCfbContainer(buffer) && !isRtf) return unreadable("unreadable_corrupt", "local_textutil_doc");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "doc-"));
    let raw = "";
    try {
      const file = path.join(dir, "file.doc");
      fs.writeFileSync(file, buffer);
      raw = await execFileP("/usr/bin/textutil", ["-convert", "txt", "-stdout", file]);
    } catch {
      return unreadable("unreadable_corrupt", "local_textutil_doc");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    // Paragraphs separated by a blank line, as mammoth writes a .docx — so a .doc reads as its .docx
    // twin would, and the windows (which cut at blank lines) fall in the same places.
    const paragraphs = raw.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.trim()).join("\n\n");
    const normalized = normalizeTextCapped(paragraphs);
    if (!normalized.text) return unreadable("unreadable_empty", "local_textutil_doc");
    return shaped({ text: normalized.text, source: "local_textutil_doc", charsTotal: raw.length, charsCapped: normalized.capped });
  }

  return unreadable("unreadable_format", "unsupported");
}

function jsonResponse(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
  });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    jsonResponse(res, 204, {});
    return;
  }
  if (req.method !== "POST" || req.url !== "/extract") {
    jsonResponse(res, 404, { error: "Not found" });
    return;
  }

  try {
    let received = 0;
    const chunks = [];
    for await (const chunk of req) {
      received += chunk.length;
      if (received > MAX_BODY_BYTES) {
        jsonResponse(res, 413, { error: "Payload too large" });
        return;
      }
      chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    const payload = JSON.parse(raw || "{}");
    const fileName = String(payload.file_name || "").trim();
    const fileType = String(payload.file_type || "").trim();
    const contentBase64 = String(payload.content_base64 || "").trim();

    // S0: an EMPTY file is a real upload, answered unreadable_empty — only a missing field is a bad request.
    if (!fileName || typeof payload.content_base64 !== "string") {
      jsonResponse(res, 400, { error: "file_name and content_base64 are required" });
      return;
    }

    const result = await extractText({ fileName, fileType, contentBase64 });
    jsonResponse(res, 200, result);
  } catch (error) {
    jsonResponse(res, 500, {
      error: error instanceof Error ? error.message : "Parser server error",
      source: "error",
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[local-parser] listening on http://${HOST}:${PORT}/extract`);
});

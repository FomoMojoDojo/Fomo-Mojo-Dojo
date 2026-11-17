#!/usr/bin/env node
import http from "node:http";
import { createRequire } from "node:module";
import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
const OCR_BIN = process.env.VISION_OCR_BIN || path.join(path.dirname(fileURLToPath(import.meta.url)), "ocr", "bin", "vision-ocr");
const OCR_VERSION = (() => {
  try {
    const v = JSON.parse(execFileSync(OCR_BIN, ["--version"], { encoding: "utf8", timeout: 20_000 }));
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
  server: "local-parser-server-2026-11-16-doc",
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
  execFile(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 2 * 60_000 }, (err, stdout) => (err ? reject(err) : resolve(stdout)));
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
  const shaped = ({ text, source, images = 0, pagesRead = null, pagesTotal = null, charsTotal = null, charsCapped = false, ocrPages = 0 }) => ({
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

#!/usr/bin/env node
import http from "node:http";
import { createRequire } from "node:module";
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
const PARSER_VERSIONS = Object.freeze({
  // bumped for SP-93: the response shape gained pages_read / pages_total / chars_total, so a
  // stored extraction_version distinguishes a record that could say "partial" from one that could not
  server: "local-parser-server-2026-11-13",
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

function normalizeText(text, maxChars = 120_000) {
  const compact = normalizeUnicodeArtifacts(text)
    .replace(/\r/g, "\n")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (compact.length <= maxChars) return compact;
  return `${compact.slice(0, maxChars).trimEnd()}\n\n[truncated]`;
}

// EXTRACTION SHAPE (ruling 8, 2026-09-14): every path reports chars (text read), images (images it did NOT
// read — no OCR exists), pages where the format knows them, and the parser path. An image-borne document
// is then distinguishable from a two-sentence one downstream.
const IMAGE_OPS = new Set(["paintImageXObject", "paintImageXObjectRepeat", "paintJpegXObject", "paintInlineImageXObject", "paintImageMaskXObject"]);

// SP-93 (2026-11-12): the 30-page cap STAYS for now. Lifting it before chunking exists would turn
// documents that analyse today into documents that fail. What changes here is that the read stops
// hiding behind the document's own page count: this extraction reports pages_read (what it opened)
// beside pages_total (what the document has), and every surface that shows the analysis says so
// when they differ. Removing the cap belongs to the chunking slice, not this one.
const PDF_PAGE_CAP = 30;

async function extractPdfText(buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(buffer), disableWorker: true });
  const doc = await task.promise;
  const pagesTotal = doc.numPages;
  const pagesRead = Math.min(pagesTotal, PDF_PAGE_CAP);
  const chunks = [];
  let images = 0;
  const opNames = new Map(Object.entries(pdfjs.OPS).map(([name, code]) => [code, name]));
  for (let page = 1; page <= pagesRead; page += 1) {
    const p = await doc.getPage(page);
    const content = await p.getTextContent();
    const text = content.items
      .map((item) => (item && typeof item === "object" && "str" in item ? String(item.str || "") : ""))
      .filter(Boolean)
      .join(" ");
    if (text.trim()) chunks.push(`[Page ${page}] ${text.trim()}`);
    try {
      const ops = await p.getOperatorList();
      for (const fn of ops.fnArray) if (IMAGE_OPS.has(opNames.get(fn))) images += 1;
    } catch {
      // image count is best-effort; text extraction is the authority
    }
  }
  // Was `pages: doc.numPages` — the DOCUMENT's count returned beside text covering only the first
  // PDF_PAGE_CAP of them, so a 77-page filing recorded "77 pages" for a 30-page read (SP-93).
  const joined = chunks.join("\n\n");
  return { text: normalizeText(joined), images, pagesRead, pagesTotal, charsTotal: joined.length };
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
  return { text: normalizeText(raw), images, pagesRead: null, pagesTotal: null, charsTotal: raw.length };
}

async function extractText({ fileName, fileType, contentBase64 }) {
  const buffer = Buffer.from(String(contentBase64 || ""), "base64");
  const ext = extensionFromName(fileName);
  const normalizedType = String(fileType || "").toLowerCase();
  // SP-93: the shape says what was READ and what EXISTS, separately.
  //   chars        — characters in the `text` field, i.e. after normalizeText's 120k cap
  //   chars_total  — characters before that cap, over the pages this read opened
  //   pages_read   — pages this extraction opened (null where the format has no pages)
  //   pages_total  — pages the document has (null likewise)
  //   pages        — retained, and now EXPLICITLY the document's count: it is what the stored
  //                  extraction_pages column has always meant, so old rows keep their meaning
  const shaped = ({ text, source, images = 0, pagesRead = null, pagesTotal = null, charsTotal = null }) => ({
    text,
    source,
    chars: text.length,
    chars_total: charsTotal ?? text.length,
    images,
    pages: pagesTotal,
    pages_read: pagesRead,
    pages_total: pagesTotal,
    versions: PARSER_VERSIONS,
  });

  const isText =
    normalizedType.startsWith("text/") ||
    normalizedType.includes("json") ||
    normalizedType.includes("csv") ||
    ["txt", "csv", "md", "json", "xml", "yaml", "yml", "toml", "vtt", "srt"].includes(ext);
  if (isText) {
    const raw = buffer.toString("utf8");
    return shaped({ text: normalizeText(raw), source: "local_text_reader", charsTotal: raw.length });
  }

  const isPdf = normalizedType.includes("pdf") || ext === "pdf";
  if (isPdf) {
    const { text, images, pagesRead, pagesTotal, charsTotal } = await extractPdfText(buffer);
    return shaped({ text, source: "local_parser_pdfjs", images, pagesRead, pagesTotal, charsTotal });
  }

  const isDocx =
    normalizedType.includes("officedocument.wordprocessingml.document") || ext === "docx";
  if (isDocx) {
    const { text, images, pagesRead, pagesTotal, charsTotal } = await extractDocxText(buffer);
    return shaped({ text, source: "local_parser_mammoth", images, pagesRead, pagesTotal, charsTotal });
  }

  return shaped({ text: "", source: "unsupported", charsTotal: 0 });
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

    if (!fileName || !contentBase64) {
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

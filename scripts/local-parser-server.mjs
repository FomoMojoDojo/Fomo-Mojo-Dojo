#!/usr/bin/env node
import http from "node:http";
import mammoth from "mammoth";

const HOST = process.env.LOCAL_PARSER_HOST || "0.0.0.0";
const PORT = Number(process.env.LOCAL_PARSER_PORT || 8789);
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

async function extractPdfText(buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(buffer), disableWorker: true });
  const doc = await task.promise;
  const pageCount = Math.min(doc.numPages, 30);
  const chunks = [];
  for (let page = 1; page <= pageCount; page += 1) {
    const p = await doc.getPage(page);
    const content = await p.getTextContent();
    const text = content.items
      .map((item) => (item && typeof item === "object" && "str" in item ? String(item.str || "") : ""))
      .filter(Boolean)
      .join(" ");
    if (text.trim()) chunks.push(`[Page ${page}] ${text.trim()}`);
  }
  return normalizeText(chunks.join("\n\n"));
}

async function extractDocxText(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return normalizeText(result.value || "");
}

async function extractText({ fileName, fileType, contentBase64 }) {
  const buffer = Buffer.from(String(contentBase64 || ""), "base64");
  const ext = extensionFromName(fileName);
  const normalizedType = String(fileType || "").toLowerCase();

  const isText =
    normalizedType.startsWith("text/") ||
    normalizedType.includes("json") ||
    normalizedType.includes("csv") ||
    ["txt", "csv", "md", "json", "xml", "yaml", "yml", "toml"].includes(ext);
  if (isText) {
    return { text: normalizeText(buffer.toString("utf8")), source: "local_text_reader" };
  }

  const isPdf = normalizedType.includes("pdf") || ext === "pdf";
  if (isPdf) {
    const text = await extractPdfText(buffer);
    return { text, source: "local_parser_pdfjs" };
  }

  const isDocx =
    normalizedType.includes("officedocument.wordprocessingml.document") || ext === "docx";
  if (isDocx) {
    const text = await extractDocxText(buffer);
    return { text, source: "local_parser_mammoth" };
  }

  return { text: "", source: "unsupported" };
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

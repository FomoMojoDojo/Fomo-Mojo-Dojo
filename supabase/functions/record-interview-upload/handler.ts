// record-interview-upload (Gate B commit 1 — operator rulings A1–A5, R1–R8, signed 2026-09-19).
//
// Input (A4): { company_id, input_file_id, speaker_role, file_sha256 }. The client NEVER sends transcript text;
// the server reads the saved object and extracts. The saved file is the authority:
//   1. the input_files row must exist, belong to the company and carry is_interview = true (A1);
//   2. sha256(bytes of the storage object) must equal file_sha256 → else 422 file_hash_mismatch (S6) (R1);
//   3. extraction (format amendment F1–F3): .txt / .md / .vtt / .srt in-runtime (local_text_reader) — the
//      bytes decoded as STRICT UTF-8 (invalid bytes → 422 S5, never a replacement character), a leading UTF-8
//      BOM (EF BB BF) dropped, and NOTHING else touched: timestamps, speaker labels, cue numbers, line endings
//      and whitespace are stored exactly as the extractor returned them; .pdf / .docx via the LOCAL parser
//      (local_parser_pdfjs / local_parser_mammoth), the parser's text stored verbatim; anything else → 422
//      unsupported_transcript_type (S4); empty (or whitespace-only) text → 422 empty_extraction (S5) (R5);
//   4. ONE interview_records row (R1/R7): verbatim = the extracted text, text_sha256 (of exactly that text),
//      file_sha256, file_bytes, extraction_method, extraction_version; journey_key NULL; market_state =
//      'per_item' for a client_stakeholder, 'unplaced' for a market_participant; market_basis =
//      [{kind:"original", result:"none"}] (inference is commit 2); interviewed_at NULL (R9 — the upload time is
//      not the interview date); no person_name, no consent_basis, no interviewer; created_by = the
//      authenticated caller ONLY (R10 — no caller → 401, nothing recorded, file + row rolled back);
//   5. ONE integrity_runs row (component interview_upload): ids, hashes, byte and character counts, method and
//      version — never transcript text.
// On ANY failure after step 1 the storage object and the input_files row are rolled back (A1: nothing a reader
// can pick up), and a rejected integrity row names the reason. No sidecar is written, ever (R6). No model.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { FROZEN_COMPANY_IDS } from "../_shared/frozenCompanies.ts";
import { recordIntegrityRun } from "../_shared/integrity.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// 4f-1: "working session" is the third record type — a first-read review meeting, where our side
// and theirs are in the room together. It is placed PER ITEM, like a stakeholder transcript.
export const SPEAKER_ROLES = new Set(["client_stakeholder", "market_participant", "working_session"]);
export const TEXT_EXTENSIONS = new Set(["txt", "md", "vtt", "srt"]);
export const PARSER_EXTENSIONS = new Set(["pdf", "docx"]);
/** F3 — the exact text-reader rule, recorded on every text record: strict UTF-8 (fatal on invalid bytes),
 *  a leading BOM dropped, no other change to the bytes' text. */
export const TEXT_READER_VERSION = "edge-runtime-text-reader-2026-09-19:utf8-strict,bom-dropped,verbatim";

/** Signed strings (2026-09-19) — the ONLY client-visible messages this function emits. */
export const STRINGS = {
  S4: "This file type can't be read as a transcript. Upload a text, Word or PDF file.",
  S5: "No text could be read from this file. Nothing was recorded.",
  S6: "The saved file doesn't match the upload. Nothing was recorded. Try again.",
} as const;

export type ParserResult = { text: string; source: string; versions?: Record<string, string> | null };
export type ParserCall = (args: { parserUrl: string; fileName: string; fileType: string; blob: Blob }) => Promise<ParserResult>;
export type Deps = { createClient: typeof createClient; callParser?: ParserCall; now?: () => string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
const text = (v: unknown) => String(v ?? "").trim();
function isLocalUrl(rawUrl: string): boolean {
  try { const h = new URL(rawUrl).hostname; return ["localhost", "127.0.0.1", "::1", "host.docker.internal"].includes(h); } catch { return false; }
}
export function extensionOf(name: string): string {
  const i = name.lastIndexOf("."); return i < 0 ? "" : name.slice(i + 1).toLowerCase();
}
export async function sha256HexBytes(bytes: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
export async function sha256HexText(s: string): Promise<string> {
  return sha256HexBytes(new TextEncoder().encode(s).buffer as ArrayBuffer);
}
/** F2/F3 — decode the bytes as strict UTF-8, drop a leading BOM, change nothing else. Throws on invalid bytes. */
export function decodeTranscriptBytes(bytes: ArrayBuffer): string {
  let view = new Uint8Array(bytes);
  if (view.length >= 3 && view[0] === 0xef && view[1] === 0xbb && view[2] === 0xbf) view = view.subarray(3);
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(view);
}
export function marketStateFor(speakerRole: string): "per_item" | "unplaced" {
  // Only a CUSTOMER transcript is placed as a whole, against the one market its speaker belongs
  // to. A stakeholder transcript and a working session both carry items about several markets
  // (or none), so both are per_item and are placed after parsing.
  return speakerRole === "market_participant" ? "unplaced" : "per_item";
}
export function extractionVersionFrom(source: string, versions: Record<string, string> | null | undefined): string {
  if (source === "local_text_reader") return TEXT_READER_VERSION;
  if (!versions || typeof versions !== "object") return "local-parser:unversioned";
  const parts = Object.entries(versions).filter(([, v]) => typeof v === "string" && v).map(([k, v]) => `${k}=${v}`);
  return parts.length ? `local-parser:${parts.join(",")}` : "local-parser:unversioned";
}

async function defaultCallParser(args: { parserUrl: string; fileName: string; fileType: string; blob: Blob }): Promise<ParserResult> {
  const bytes = new Uint8Array(await args.blob.arrayBuffer());
  let binary = ""; const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  const resp = await fetch(args.parserUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file_name: args.fileName, file_type: args.fileType, content_base64: btoa(binary) }) });
  if (!resp.ok) throw new Error(`Local parser error (${resp.status}): ${(await resp.text().catch(() => "")).slice(0, 200)}`);
  const data = await resp.json().catch(() => ({})) as Record<string, unknown>;
  return { text: typeof data.text === "string" ? data.text : "", source: typeof data.source === "string" ? data.source : "local_parser", versions: (data.versions && typeof data.versions === "object") ? data.versions as Record<string, string> : null };
}

export async function handleRecordInterviewUpload(req: Request, deps: Deps = { createClient }): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Only POST is supported." }, 405);
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const companyId = text(body.company_id);
    if (!companyId) return json({ ok: false, error: "company_id required" }, 400);
    const inputFileId = text(body.input_file_id);
    if (!inputFileId) return json({ ok: false, error: "input_file_id required" }, 400);
    const speakerRole = text(body.speaker_role);
    if (!SPEAKER_ROLES.has(speakerRole)) return json({ ok: false, error: "speaker_role must be client_stakeholder, market_participant or working_session" }, 400);
    const claimedSha = text(body.file_sha256).toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(claimedSha)) return json({ ok: false, error: "file_sha256 required (64 hex chars)" }, 400);
    if (typeof body.transcript_text === "string" || typeof body.text === "string") return json({ ok: false, error: "the client never sends transcript text (A4)" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceRole) return json({ ok: false, error: "Missing Supabase env vars" }, 500);
    const parserUrl = Deno.env.get("LOCAL_PARSER_URL") ?? "http://host.docker.internal:8789/extract";
    if (!isLocalUrl(parserUrl)) return json({ ok: false, error: "Local-only policy violation: LOCAL_PARSER_URL must resolve to localhost/host.docker.internal." }, 500);
    if (FROZEN_COMPANY_IDS.has(companyId)) return json({ ok: false, error: "frozen_company", message: "This company is a frozen reference fixture (SELECT-only)." }, 403);

    // deno-lint-ignore no-explicit-any
    const db = deps.createClient(supabaseUrl, serviceRole) as unknown as { from: (t: string) => any; storage: any; auth: any };
    const nowIso = deps.now ? deps.now() : new Date().toISOString();

    // 1. the file row — ours, flagged (A1)
    const { data: file, error: fileErr } = await db.from("input_files").select("id, input_id, file_name, file_type, file_path, uploaded_at, is_interview, inputs!inner(company_id)").eq("id", inputFileId).maybeSingle();
    if (fileErr) return json({ ok: false, error: "lookup_failed", message: String(fileErr.message ?? fileErr) }, 500);
    if (!file) return json({ ok: false, error: "no_input_file", message: `input_files ${inputFileId} not found — nothing was recorded.` }, 404);
    const fileCompany = String((file.inputs as { company_id?: unknown } | null)?.company_id ?? "");
    if (fileCompany !== companyId) return json({ ok: false, error: "company_mismatch", message: "The file belongs to another company — nothing was recorded." }, 403);
    if (file.is_interview !== true) return json({ ok: false, error: "file_not_flagged", message: "The file row is not flagged is_interview — nothing was recorded (A1: the flag is set in the same insert as the row)." }, 422);
    const filePath = text(file.file_path); const fileName = text(file.file_name); const fileType = text(file.file_type);
    const { data: existing } = await db.from("interview_records").select("id").eq("input_file_id", inputFileId).maybeSingle();
    if (existing?.id) return json({ ok: false, error: "already_recorded", record_id: existing.id, message: "This file already has an interview record." }, 409);

    // Rollback (A1): the storage object and the input_files row go together; a rejected integrity row keeps the reason.
    const rollback = async (reason: string, detail: Record<string, unknown>) => {
      const removed = await db.storage.from("input-files").remove([filePath]);
      const deleted = await db.from("input_files").delete().eq("id", inputFileId);
      await recordIntegrityRun(db, {
        company_id: companyId, component: "interview_upload", surface_type: "input_files", surface_id: inputFileId, status: "rejected", examined: 1, admitted: 0,
        excluded_by_rule: { reason, input_file_id: inputFileId, file_name: fileName, speaker_role: speakerRole, rolled_back: { storage: !removed?.error, input_files: !deleted?.error }, ...detail },
        error: reason, run_ref: "record-interview-upload",
      });
      return { storage: !removed?.error, input_files: !deleted?.error };
    };

    // 2. the bytes — hash-equal or refused (R1)
    const { data: blob, error: dlErr } = await db.storage.from("input-files").download(filePath);
    if (dlErr || !blob) {
      const rb = await rollback("object_unreadable", { storage_error: String(dlErr?.message ?? dlErr ?? "no object") });
      return json({ ok: false, error: "object_unreadable", message: STRINGS.S6, rolled_back: rb }, 422);
    }
    const bytes = await (blob as Blob).arrayBuffer();
    const fileSha = await sha256HexBytes(bytes);
    const fileBytes = bytes.byteLength;
    if (fileSha !== claimedSha) {
      const rb = await rollback("file_hash_mismatch", { file_bytes: fileBytes, claimed_sha256: claimedSha, stored_sha256: fileSha });
      return json({ ok: false, error: "file_hash_mismatch", message: STRINGS.S6, rolled_back: rb }, 422);
    }

    // 3. extraction — text in-runtime, pdf/docx via the local parser, anything else refused (S4); empty refused (S5)
    const ext = extensionOf(fileName);
    let extracted = ""; let method = ""; let version = "";
    if (TEXT_EXTENSIONS.has(ext)) {
      try {
        extracted = decodeTranscriptBytes(bytes);
      } catch {
        const rb = await rollback("invalid_utf8", { file_bytes: fileBytes, file_sha256: fileSha, extraction_method: "local_text_reader", extraction_version: TEXT_READER_VERSION });
        return json({ ok: false, error: "invalid_utf8", message: STRINGS.S5, rolled_back: rb }, 422);
      }
      method = "local_text_reader"; version = TEXT_READER_VERSION;
    } else if (PARSER_EXTENSIONS.has(ext)) {
      try {
        const parsed = await (deps.callParser ?? defaultCallParser)({ parserUrl, fileName, fileType, blob: new Blob([bytes], { type: fileType || "application/octet-stream" }) });
        extracted = typeof parsed.text === "string" ? parsed.text : "";
        method = parsed.source || "local_parser";
        version = extractionVersionFrom(method, parsed.versions);
      } catch (e) {
        const rb = await rollback("parser_failed", { file_bytes: fileBytes, file_sha256: fileSha, parser_error: String((e as Error)?.message ?? e).slice(0, 300) });
        return json({ ok: false, error: "parser_failed", message: STRINGS.S5, rolled_back: rb }, 422);
      }
    } else {
      const rb = await rollback("unsupported_transcript_type", { file_bytes: fileBytes, file_sha256: fileSha, extension: ext });
      return json({ ok: false, error: "unsupported_transcript_type", message: STRINGS.S4, rolled_back: rb }, 422);
    }
    if (!extracted.trim()) {
      const rb = await rollback("empty_extraction", { file_bytes: fileBytes, file_sha256: fileSha, extraction_method: method, extraction_version: version });
      return json({ ok: false, error: "empty_extraction", message: STRINGS.S5, rolled_back: rb }, 422);
    }
    const textSha = await sha256HexText(extracted);

    // 4. the record — created_by = the authenticated caller ONLY (R10): no caller → 401, nothing recorded,
    //    the object and the row rolled back. Never the company owner.
    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      try {
        const anon = deps.createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", { global: { headers: { Authorization: authHeader } } });
        const { data } = await (anon as unknown as typeof db).auth.getUser();
        userId = data?.user?.id ? String(data.user.id) : null;
      } catch { userId = null; }
    }
    if (!userId) {
      const rb = await rollback("no_authenticated_caller", { file_bytes: fileBytes, file_sha256: fileSha });
      return json({ ok: false, error: "no_authenticated_caller", message: STRINGS.S6, rolled_back: rb }, 401);
    }
    const marketState = marketStateFor(speakerRole);
    const row = {
      company_id: companyId, speaker_role: speakerRole, person_name: null, person_role: null, journey_key: null,
      interviewed_at: null, interviewer: null, consent_basis: null, verbatim: extracted, created_by: userId,
      input_file_id: inputFileId, file_sha256: fileSha, file_bytes: fileBytes, text_sha256: textSha,
      extraction_method: method, extraction_version: version,
      market_state: marketState, market_basis: [{ kind: "original", result: "none", at: nowIso }], review_state: "unreviewed",
    };
    const { data: inserted, error: insErr } = await db.from("interview_records").insert(row).select("id").single();
    if (insErr || !inserted?.id) {
      const rb = await rollback("record_write_refused", { file_bytes: fileBytes, file_sha256: fileSha, text_sha256: textSha, chars: extracted.length, extraction_method: method, extraction_version: version, db_error: String(insErr?.message ?? insErr ?? "no id").slice(0, 300) });
      return json({ ok: false, error: "record_write_refused", message: STRINGS.S6, rolled_back: rb }, 409);
    }

    // 5. the audit row — ids, hashes, counts, method/version; never text
    await recordIntegrityRun(db, {
      company_id: companyId, component: "interview_upload", surface_type: "interview_records", surface_id: String(inserted.id), status: "completed", examined: 1, admitted: 1,
      excluded_by_rule: { input_file_id: inputFileId, record_id: inserted.id, file_name: fileName, speaker_role: speakerRole, market_state: marketState, file_sha256: fileSha, file_bytes: fileBytes, text_sha256: textSha, chars: extracted.length, extraction_method: method, extraction_version: version, sidecar_written: false, model_called: false },
      run_ref: "record-interview-upload",
    });
    return json({ ok: true, record_id: inserted.id, input_file_id: inputFileId, speaker_role: speakerRole, market_state: marketState, file_sha256: fileSha, file_bytes: fileBytes, text_sha256: textSha, chars: extracted.length, extraction_method: method, extraction_version: version });
  } catch (err) {
    return json({ ok: false, error: String((err as Error)?.message ?? err) }, 500);
  }
}

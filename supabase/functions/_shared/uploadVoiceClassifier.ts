// VOICE-GATE — classifyUploadVoice: one local qwen2.5:14b-instruct read of a
// single uploaded document's VOICE. Reads file_name + file_type + the capped
// extracted-text excerpt and returns a verdict + the model's VERBATIM basis.
//
// LAWS
// - FAIL TOWARD EXTERNAL: any model failure / empty / unparseable result ⇒
//   verdict='external' (declared-INeligible), loudly logged. There is NO
//   deterministic content fallback and NO 70b escalation — a classifier that
//   cannot speak does not get to call a document the client's voice.
// - VERBATIM-OR-NOTHING: basis is the model's own reason, never synthesized. On
//   the external fallback the basis records the failure verbatim.
// - LOCAL ONLY: localhost/host.docker.internal Ollama allowlist; num_ctx 8192
//   (one excerpt ≤3,600 chars fits with wide margin).
// - EXACT-MATCH idempotence: a (input_file_id, content_sha) that already has a
//   model verdict row is NEVER re-classified and NEVER re-written (the store is
//   immutable-per-content). Lookups are exact — never latest-wins-by-created_at.

import { loadContributingDocs, type ContributingDoc } from "./uploadCorpus.ts";

export const CLASSIFIER_MODEL = "qwen2.5:14b-instruct";
const CLASSIFY_TIMEOUT_MS = 120_000;
const LOCAL_HOST_ALLOWLIST = new Set(["localhost", "127.0.0.1", "::1", "host.docker.internal"]);

export type VoiceVerdict = "client_voice" | "external" | "uncertain";

export function isLocalOllamaUrl(rawUrl: string): boolean {
  try {
    return LOCAL_HOST_ALLOWLIST.has(String(new URL(rawUrl).hostname || "").trim().toLowerCase());
  } catch {
    return false;
  }
}

const CLASSIFY_SYSTEM =
  "You classify the VOICE of a single uploaded business document. The question is NOT what the document is about — it is WHOSE WORDS these are. " +
  "Return exactly one verdict:\n" +
  "- client_voice: the document IS the client company's own words — their brand/strategy deck, their memo, their website copy, their leadership's writing, their internal notes, a transcript of them speaking. First-party.\n" +
  "- external: the words are NOT the client's — a third-party analyst report, a competitor's material, a vendor template, a generic framework/worksheet, market data, a journalist's article, or any document authored by someone other than the client about or around them.\n" +
  "- uncertain: you genuinely cannot tell whose words these are from what is shown.\n" +
  "Judge authorship, not topic: a document ABOUT the client written by someone else is external. When the excerpt is too thin to tell, answer uncertain — never guess client_voice. " +
  'Return JSON only: {"verdict":"client_voice|external|uncertain","basis":"one sentence, in your own words, citing what in the document shows whose voice it is"}.';

function buildClassifyUser(doc: { file_name: string; file_type: string; excerpt: string }): string {
  return (
    `FILE NAME: ${doc.file_name || "(none)"}\n` +
    `FILE TYPE: ${doc.file_type || "(unknown)"}\n\n` +
    `DOCUMENT EXCERPT (verbatim, may be truncated):\n${doc.excerpt}\n\n` +
    `Whose voice is this? Return the JSON verdict.`
  );
}

export async function callClassifier(ollamaUrl: string, model: string, system: string, user: string): Promise<string> {
  const nativeBase = ollamaUrl.replace(/\/v1\/?$/, "");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), CLASSIFY_TIMEOUT_MS);
  try {
    const resp = await fetch(`${nativeBase}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer ollama" },
      body: JSON.stringify({
        model,
        format: "json",
        stream: false,
        options: { num_ctx: 8192, temperature: 0.1 },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: ctrl.signal,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json().catch(() => ({}));
    const content = String((data as { message?: { content?: unknown } })?.message?.content ?? "");
    if (!content) throw new Error("empty content");
    return content;
  } finally {
    clearTimeout(t);
  }
}

// Pure single-document classification. Fail-toward-external is enforced HERE — the
// only way out of this function is a concrete verdict; failure resolves to external.
export async function classifyUploadVoice(
  doc: { file_name: string; file_type: string; excerpt: string },
  opts: { ollamaUrl: string; model?: string },
): Promise<{ verdict: VoiceVerdict; basis: string; model: string }> {
  const model = opts.model ?? CLASSIFIER_MODEL;
  try {
    const raw = await callClassifier(opts.ollamaUrl, model, CLASSIFY_SYSTEM, buildClassifyUser(doc));
    let parsed: { verdict?: unknown; basis?: unknown };
    try {
      parsed = JSON.parse(raw) as { verdict?: unknown; basis?: unknown };
    } catch {
      console.warn(`[classify-upload-voice] unparseable model output → external (${doc.file_name}): ${raw.slice(0, 140)}`);
      return { verdict: "external", basis: `classifier output was unparseable — failing toward external. raw: ${raw.slice(0, 200)}`, model };
    }
    const verdict = String(parsed.verdict ?? "").trim();
    const basis = String(parsed.basis ?? "").trim();
    if ((verdict === "client_voice" || verdict === "external" || verdict === "uncertain") && basis) {
      return { verdict: verdict as VoiceVerdict, basis, model };
    }
    console.warn(`[classify-upload-voice] malformed verdict → external (${doc.file_name}): verdict='${verdict}' basisLen=${basis.length}`);
    return { verdict: "external", basis: `classifier returned a malformed verdict ('${verdict || "empty"}') — failing toward external.`, model };
  } catch (err) {
    const msg = String((err as Error)?.message ?? err);
    console.warn(`[classify-upload-voice] classifier call failed → external (${doc.file_name}): ${msg}`);
    return { verdict: "external", basis: `classifier call failed (${msg}) — failing toward external.`, model };
  }
}

// ── orchestration over a company's corpus ───────────────────────────────────────

export type DocVoiceStatus = {
  input_file_id: string;
  file_name: string;
  content_sha: string;
  verdict: VoiceVerdict | null; // model verdict (null if no sha-matched model row)
  basis: string | null;
  operator_override: "client_voice" | "external" | null;
  status: "classified" | "unclassified";
};

// Read the CURRENT model verdict + any override for each contributing doc, by
// EXACT (input_file_id, content_sha). Never selects by created_at — an edited doc
// (new sha) reads as unclassified even though older-sha rows exist for the file.
async function readCurrentVerdicts(
  supabase: { from: (t: string) => any },
  companyId: string,
  docs: ContributingDoc[],
): Promise<Map<string, { verdict: VoiceVerdict | null; basis: string | null; override: "client_voice" | "external" | null }>> {
  const map = new Map<string, { verdict: VoiceVerdict | null; basis: string | null; override: "client_voice" | "external" | null }>();
  if (docs.length === 0) return map;
  const fileIds = docs.map((d) => d.input_file_id);
  const { data, error } = await supabase
    .from("doc_voice_verdicts")
    .select("input_file_id, content_sha, verdict, basis, operator_override")
    .eq("company_id", companyId)
    .in("input_file_id", fileIds);
  if (error) throw new Error(`doc_voice_verdicts read failed: ${error.message}`);
  const shaByFile = new Map(docs.map((d) => [d.input_file_id, d.content_sha]));
  for (const row of (data ?? []) as Array<{ input_file_id: string; content_sha: string; verdict: string; basis: string; operator_override: string | null }>) {
    // EXACT sha match only — rows for an older content of the same file are ignored.
    if (shaByFile.get(row.input_file_id) !== row.content_sha) continue;
    const key = `${row.input_file_id}|${row.content_sha}`;
    const cur = map.get(key) ?? { verdict: null, basis: null, override: null };
    if (row.operator_override === "client_voice" || row.operator_override === "external") {
      cur.override = row.operator_override;
    } else {
      cur.verdict = row.verdict as VoiceVerdict;
      cur.basis = row.basis;
    }
    map.set(key, cur);
  }
  return map;
}

// plan:true — list each contributing doc's current status. ZERO model calls, ZERO
// writes. This is the operator's pre-run manifest.
export async function planUploadVoice(
  supabase: { from: (t: string) => any } & { storage: any },
  companyId: string,
): Promise<{ docs: DocVoiceStatus[] }> {
  const docs = await loadContributingDocs(supabase as any, companyId);
  const verdicts = await readCurrentVerdicts(supabase, companyId, docs);
  return {
    docs: docs.map((d) => {
      const cur = verdicts.get(`${d.input_file_id}|${d.content_sha}`);
      return {
        input_file_id: d.input_file_id,
        file_name: d.file_name,
        content_sha: d.content_sha,
        verdict: cur?.verdict ?? null,
        basis: cur?.basis ?? null,
        operator_override: cur?.override ?? null,
        status: cur?.verdict ? "classified" : "unclassified",
      };
    }),
  };
}

// Classify every contributing doc that lacks a current (sha-matched) model verdict.
// Idempotent: already-classified docs are skipped (no model call, no write).
export async function runUploadVoiceClassification(
  supabase: { from: (t: string) => any } & { storage: any },
  companyId: string,
  opts: { ollamaUrl: string; model?: string; write?: boolean },
): Promise<{ docs: DocVoiceStatus[]; totals: { contributing: number; classified_now: number; skipped_existing: number; external: number; client_voice: number; uncertain: number } }> {
  const write = opts.write !== false;
  const docs = await loadContributingDocs(supabase as any, companyId);
  const existing = await readCurrentVerdicts(supabase, companyId, docs);
  const totals = { contributing: docs.length, classified_now: 0, skipped_existing: 0, external: 0, client_voice: 0, uncertain: 0 };
  const out: DocVoiceStatus[] = [];

  for (const d of docs) {
    const key = `${d.input_file_id}|${d.content_sha}`;
    const cur = existing.get(key);
    if (cur?.verdict) {
      totals.skipped_existing++;
      out.push({
        input_file_id: d.input_file_id, file_name: d.file_name, content_sha: d.content_sha,
        verdict: cur.verdict, basis: cur.basis, operator_override: cur.override, status: "classified",
      });
      continue;
    }
    const res = await classifyUploadVoice({ file_name: d.file_name, file_type: d.file_type, excerpt: d.excerpt }, { ollamaUrl: opts.ollamaUrl, model: opts.model });
    totals.classified_now++;
    totals[res.verdict]++;
    if (write) {
      // Insert the immutable model verdict row; idempotent under the partial-unique.
      const { error } = await supabase.from("doc_voice_verdicts").insert({
        input_file_id: d.input_file_id,
        company_id: companyId,
        content_sha: d.content_sha,
        verdict: res.verdict,
        basis: res.basis,
        classifier_model: res.model,
      });
      if (error && !String(error.message ?? "").toLowerCase().includes("duplicate")) {
        throw new Error(`doc_voice_verdicts insert failed (${d.file_name}): ${error.message}`);
      }
    }
    out.push({
      input_file_id: d.input_file_id, file_name: d.file_name, content_sha: d.content_sha,
      verdict: res.verdict, basis: res.basis, operator_override: cur?.override ?? null, status: "classified",
    });
  }
  return { docs: out, totals };
}

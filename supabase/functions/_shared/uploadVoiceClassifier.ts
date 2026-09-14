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
/** Version of the classifier's judgment (doc_voice_verdicts.classifier_version): 2 = authorship + subject (a779766). */
export const CLASSIFIER_VERSION = 2;
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

// AUTHORSHIP + SUBJECT (rulings 3, 4, 11 — 2026-09-13). The classifier now returns two facts, and the
// binary VOICE verdict every existing gate reads is a projection of authorship:
//   authorship: client | us | third_party | uncertain      subject: this_company | the_market | uncertain
//   voice:      client ⇒ client_voice; us | third_party ⇒ external; uncertain ⇒ uncertain
// "us" is operator-authored analysis — an advisor's landscape read, a consultant's framing, our own notes
// addressed to the client. It is NOT the client's voice (never declared) and NOT third-party record.
export type Authorship = "client" | "us" | "third_party" | "uncertain";
export type Subject = "this_company" | "the_market" | "uncertain";
export function voiceFromAuthorship(a: Authorship): VoiceVerdict {
  return a === "client" ? "client_voice" : a === "uncertain" ? "uncertain" : "external";
}
export function authorshipFromVoice(v: string | null | undefined): Authorship {
  return v === "client_voice" ? "client" : v === "external" ? "third_party" : "uncertain";
}

const CLASSIFY_SYSTEM =
  "You classify a single uploaded business document on two independent facts. The client company is the organization this workspace belongs to; its name appears in the file name or the text. " +
  "FACT 1 — AUTHORSHIP: WHOSE WORDS are these? Exactly one of:\n" +
  "- client: the document IS the client company's own words — their brand/strategy deck, their memo, their mission statement, their website copy, their leadership speaking in the first person, their board materials. First-party.\n" +
  "- us: written BY AN ADVISOR, CONSULTANT OR ANALYST WORKING FOR THE CLIENT, addressed to or about the client — a landscape analysis prepared for them, a strategic framing or job-map hypothesis drafted for them, an advisor's meeting notes or update memo, a proposal. Signs: the client is referred to in the third person or as 'you'; the author recommends, frames, drafts or reports to the client.\n" +
  "- third_party: an independent published source — a research study, a sector or industry report, a government or foundation publication, a journalist's article, a competitor's own material, a vendor template, market data. Nobody working for the client wrote it.\n" +
  "- uncertain: you genuinely cannot tell from what is shown.\n" +
  "FACT 2 — SUBJECT: WHAT is the document about? Exactly one of:\n" +
  "- this_company: the client company itself is the subject — its strategy, brand, programs, people, plans, performance, or a study/report specifically about it.\n" +
  "- the_market: the sector, the population served, competitors, the region, policy, or the field in general — the client may be mentioned in passing or not at all.\n" +
  "- uncertain: you genuinely cannot tell.\n" +
  "Judge authorship by voice and role, never by topic: a document ABOUT the client written by someone else is not 'client'. When the excerpt is too thin, answer uncertain — never guess client. " +
  'Return JSON only: {"authorship":"client|us|third_party|uncertain","basis":"one sentence, in your own words, citing what in the document shows who wrote it","subject":"this_company|the_market|uncertain","subject_basis":"one sentence citing what shows what it is about"}.';

function buildClassifyUser(doc: { file_name: string; file_type: string; excerpt: string; operator_tags?: string[] }): string {
  return (
    `FILE NAME: ${doc.file_name || "(none)"}\n` +
    `FILE TYPE: ${doc.file_type || "(unknown)"}\n\n` +
    (doc.operator_tags && doc.operator_tags.length > 0 ? `OPERATOR TAGS AT UPLOAD (a hint, not a verdict): ${doc.operator_tags.join(", ")}\n` : "") +
    `DOCUMENT EXCERPT (verbatim, may be truncated):\n${doc.excerpt}\n\n` +
    `Who wrote this, and what is it about? Return the JSON.`
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
// only way out of this function is a concrete verdict; failure resolves to voice 'external' with
// authorship 'uncertain' and subject 'uncertain' (never declared, never corroborating).
export type ClassifyResult = { verdict: VoiceVerdict; basis: string; model: string; authorship: Authorship; subject: Subject; subject_basis: string };
export async function classifyUploadVoice(
  doc: { file_name: string; file_type: string; excerpt: string; operator_tags?: string[] },
  opts: { ollamaUrl: string; model?: string },
): Promise<ClassifyResult> {
  const model = opts.model ?? CLASSIFIER_MODEL;
  const failed = (basis: string): ClassifyResult => ({ verdict: "external", basis, model, authorship: "uncertain", subject: "uncertain", subject_basis: basis });
  try {
    const raw = await callClassifier(opts.ollamaUrl, model, CLASSIFY_SYSTEM, buildClassifyUser(doc));
    let parsed: { verdict?: unknown; authorship?: unknown; basis?: unknown; subject?: unknown; subject_basis?: unknown };
    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch {
      console.warn(`[classify-upload-voice] unparseable model output → external (${doc.file_name}): ${raw.slice(0, 140)}`);
      return failed(`classifier output was unparseable — failing toward external. raw: ${raw.slice(0, 200)}`);
    }
    // Accept the new shape (authorship) and the legacy shape (verdict) — both are the model's own words.
    const authorshipRaw = String(parsed.authorship ?? "").trim();
    const legacyVerdict = String(parsed.verdict ?? "").trim();
    const authorship: Authorship | null =
      authorshipRaw === "client" || authorshipRaw === "us" || authorshipRaw === "third_party" || authorshipRaw === "uncertain"
        ? (authorshipRaw as Authorship)
        : legacyVerdict === "client_voice" || legacyVerdict === "external" || legacyVerdict === "uncertain"
          ? authorshipFromVoice(legacyVerdict)
          : null;
    const basis = String(parsed.basis ?? "").trim();
    const subjectRaw = String(parsed.subject ?? "").trim();
    const subject: Subject = subjectRaw === "this_company" || subjectRaw === "the_market" ? (subjectRaw as Subject) : "uncertain";
    const subjectBasis = String(parsed.subject_basis ?? "").trim() || (subjectRaw ? `classifier returned subject '${subjectRaw}' without a basis` : "classifier returned no subject — uncertain");
    if (authorship && basis) {
      return { verdict: voiceFromAuthorship(authorship), basis, model, authorship, subject, subject_basis: subjectBasis };
    }
    console.warn(`[classify-upload-voice] malformed verdict → external (${doc.file_name}): authorship='${authorshipRaw || legacyVerdict}' basisLen=${basis.length}`);
    return failed(`classifier returned a malformed verdict ('${authorshipRaw || legacyVerdict || "empty"}') — failing toward external.`);
  } catch (err) {
    const msg = String((err as Error)?.message ?? err);
    console.warn(`[classify-upload-voice] classifier call failed → external (${doc.file_name}): ${msg}`);
    return failed(`classifier call failed (${msg}) — failing toward external.`);
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
  // 2026-09-13: the two facts (model row values; override row values when the operator set them)
  authorship: Authorship | null;
  subject: Subject | null;
  subject_basis: string | null;
  authorship_override: Authorship | null;
  subject_override: Subject | null;
  classifier_version: number | null;
  override_version: number | null;
};

/** The document's RESOLVED origin for minting: operator override first, then the model, else uncertain. */
export type UploadOrigin = { authorship: Authorship; subject: Subject; source: "override" | "model" | "none" };
export function resolveOrigin(cur: { verdict: VoiceVerdict | null; override: "client_voice" | "external" | null; authorship: Authorship | null; subject: Subject | null; authorship_override: Authorship | null; subject_override: Subject | null } | undefined): UploadOrigin {
  if (!cur) return { authorship: "uncertain", subject: "uncertain", source: "none" };
  const hasOverride = cur.authorship_override !== null || cur.subject_override !== null || cur.override !== null;
  const authorship: Authorship = cur.authorship_override ?? (cur.override ? authorshipFromVoice(cur.override) : null) ?? cur.authorship ?? (cur.verdict ? authorshipFromVoice(cur.verdict) : "uncertain");
  // subject: an override row without a subject falls through to the model's subject; a model row judged
  // before the fact existed (NULL) reads as uncertain — never as this_company by default.
  const subject: Subject = cur.subject_override ?? cur.subject ?? "uncertain";
  return { authorship, subject, source: hasOverride ? "override" : cur.verdict || cur.authorship ? "model" : "none" };
}

// Read the CURRENT model verdict + any override for each contributing doc, by
// EXACT (input_file_id, content_sha). Never selects by created_at — an edited doc
// (new sha) reads as unclassified even though older-sha rows exist for the file.
async function readCurrentVerdicts(
  supabase: { from: (t: string) => any },
  companyId: string,
  docs: ContributingDoc[],
): Promise<Map<string, CurrentVerdict>> {
  const map = new Map<string, CurrentVerdict>();
  if (docs.length === 0) return map;
  const fileIds = docs.map((d) => d.input_file_id);
  const { data, error } = await supabase
    .from("doc_voice_verdicts")
    .select("input_file_id, content_sha, verdict, basis, operator_override, authorship, subject, subject_basis, classifier_version, override_version")
    .eq("company_id", companyId)
    .in("input_file_id", fileIds);
  if (error) throw new Error(`doc_voice_verdicts read failed: ${error.message}`);
  const shaByFile = new Map(docs.map((d) => [d.input_file_id, d.content_sha]));
  // VERSIONED (signed 2026-09-13): for an exact (file, sha) the HIGHEST classifier_version model row and the
  // HIGHEST override_version override row are current; older rows are history and are not read here.
  const seenModel = new Map<string, number>();
  const seenOverride = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ input_file_id: string; content_sha: string; verdict: string; basis: string; operator_override: string | null; authorship: string | null; subject: string | null; subject_basis: string | null; classifier_version: number | null; override_version: number | null }>) {
    // EXACT sha match only — rows for an older content of the same file are ignored.
    if (shaByFile.get(row.input_file_id) !== row.content_sha) continue;
    const key = `${row.input_file_id}|${row.content_sha}`;
    const cur = map.get(key) ?? { verdict: null, basis: null, override: null, authorship: null, subject: null, subject_basis: null, authorship_override: null, subject_override: null, classifier_version: null, override_version: null };
    if (row.operator_override === "client_voice" || row.operator_override === "external") {
      const v = row.override_version ?? 1;
      if ((seenOverride.get(key) ?? 0) > v) continue;
      seenOverride.set(key, v);
      cur.override = row.operator_override;
      cur.authorship_override = (row.authorship as Authorship | null) ?? null;
      cur.subject_override = (row.subject as Subject | null) ?? null;
      cur.override_version = v;
    } else {
      const v = row.classifier_version ?? 1;
      if ((seenModel.get(key) ?? 0) > v) continue;
      seenModel.set(key, v);
      cur.verdict = row.verdict as VoiceVerdict;
      cur.basis = row.basis;
      cur.authorship = (row.authorship as Authorship | null) ?? null;
      cur.subject = (row.subject as Subject | null) ?? null;
      cur.subject_basis = row.subject_basis ?? null;
      cur.classifier_version = v;
    }
    map.set(key, cur);
  }
  return map;
}
type CurrentVerdict = { verdict: VoiceVerdict | null; basis: string | null; override: "client_voice" | "external" | null; authorship: Authorship | null; subject: Subject | null; subject_basis: string | null; authorship_override: Authorship | null; subject_override: Subject | null; classifier_version: number | null; override_version: number | null };

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
        authorship: cur?.authorship ?? null, subject: cur?.subject ?? null, subject_basis: cur?.subject_basis ?? null,
        authorship_override: cur?.authorship_override ?? null, subject_override: cur?.subject_override ?? null,
        classifier_version: cur?.classifier_version ?? null, override_version: cur?.override_version ?? null,
      };
    }),
  };
}

// Classify every contributing doc that lacks a current (sha-matched) model verdict.
// Idempotent: already-classified docs are skipped (no model call, no write).
export async function runUploadVoiceClassification(
  supabase: { from: (t: string) => any } & { storage: any },
  companyId: string,
  opts: { ollamaUrl: string; model?: string; write?: boolean; inputFileId?: string | null; force?: boolean; reclassifyOutdated?: boolean },
): Promise<{ docs: DocVoiceStatus[]; totals: { contributing: number; classified_now: number; skipped_existing: number; external: number; client_voice: number; uncertain: number } }> {
  const write = opts.write !== false;
  const allDocs = await loadContributingDocs(supabase as any, companyId);
  // inputFileId: classify ONE document (the upload path, right after its sidecar lands). force (with
  // write:false only): re-judge already-classified docs without writing — the accuracy read.
  const docs = opts.inputFileId ? allDocs.filter((d) => d.input_file_id === opts.inputFileId) : allDocs;
  const existing = await readCurrentVerdicts(supabase, companyId, docs);
  const tagsByFile = new Map<string, string[]>();
  if (docs.length > 0) {
    const { data: tagRows } = await supabase.from("input_files").select("id, tags").in("id", docs.map((d) => d.input_file_id));
    for (const r of ((tagRows ?? []) as Array<{ id: string; tags: string[] | null }>)) tagsByFile.set(r.id, (r.tags ?? []).filter((t) => typeof t === "string" && !t.startsWith("__area:")));
  }
  const forceReclassify = opts.force === true && !write;
  const totals = { contributing: docs.length, classified_now: 0, skipped_existing: 0, external: 0, client_voice: 0, uncertain: 0 };
  const out: DocVoiceStatus[] = [];

  for (const d of docs) {
    const key = `${d.input_file_id}|${d.content_sha}`;
    const cur = existing.get(key);
    // A current model row AT this classifier version is final; a lower-version row is history and the
    // document is re-judged as a new version-2 row beside it (opts.reclassifyOutdated) — never rewritten.
    const currentAtVersion = !!cur?.verdict && (cur.classifier_version ?? 1) >= CLASSIFIER_VERSION;
    const skip = !!cur?.verdict && !forceReclassify && (currentAtVersion || !opts.reclassifyOutdated);
    if (skip) {
      totals.skipped_existing++;
      out.push({
        input_file_id: d.input_file_id, file_name: d.file_name, content_sha: d.content_sha,
        verdict: cur!.verdict, basis: cur!.basis, operator_override: cur!.override, status: "classified",
        authorship: cur!.authorship, subject: cur!.subject, subject_basis: cur!.subject_basis, authorship_override: cur!.authorship_override, subject_override: cur!.subject_override,
        classifier_version: cur!.classifier_version, override_version: cur!.override_version,
      });
      continue;
    }
    const res = await classifyUploadVoice({ file_name: d.file_name, file_type: d.file_type, excerpt: d.excerpt, operator_tags: tagsByFile.get(d.input_file_id) ?? [] }, { ollamaUrl: opts.ollamaUrl, model: opts.model });
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
        authorship: res.authorship,
        subject: res.subject,
        subject_basis: res.subject_basis,
        classifier_version: CLASSIFIER_VERSION,
      });
      if (error && !String(error.message ?? "").toLowerCase().includes("duplicate")) {
        throw new Error(`doc_voice_verdicts insert failed (${d.file_name}): ${error.message}`);
      }
    }
    out.push({
      input_file_id: d.input_file_id, file_name: d.file_name, content_sha: d.content_sha,
      verdict: res.verdict, basis: res.basis, operator_override: cur?.override ?? null, status: "classified",
      authorship: res.authorship, subject: res.subject, subject_basis: res.subject_basis, authorship_override: cur?.authorship_override ?? null, subject_override: cur?.subject_override ?? null,
      classifier_version: CLASSIFIER_VERSION, override_version: cur?.override_version ?? null,
    });
  }
  return { docs: out, totals };
}

/**
 * The minting path's door (ruling 1): the resolved origin of ONE uploaded document, classifying it on
 * demand when no sha-matched verdict exists (immutable insert). Never returns null — an unclassifiable
 * document is {uncertain, uncertain}, which never mints declared and never corroborates.
 */
export async function resolveUploadOrigin(
  supabase: { from: (t: string) => any } & { storage: any },
  companyId: string,
  inputFileId: string,
  opts: { ollamaUrl: string; model?: string },
): Promise<UploadOrigin & { file_name: string | null; basis: string | null }> {
  const docs = (await loadContributingDocs(supabase as any, companyId)).filter((d) => d.input_file_id === inputFileId);
  if (docs.length === 0) {
    console.warn(`[upload-origin] no contributing doc (no sidecar?) for input_file ${inputFileId} — origin uncertain`);
    return { authorship: "uncertain", subject: "uncertain", source: "none", file_name: null, basis: null };
  }
  const key = `${docs[0].input_file_id}|${docs[0].content_sha}`;
  let cur = (await readCurrentVerdicts(supabase, companyId, docs)).get(key);
  if (!cur?.verdict && !cur?.override) {
    await runUploadVoiceClassification(supabase, companyId, { ollamaUrl: opts.ollamaUrl, model: opts.model, inputFileId });
    cur = (await readCurrentVerdicts(supabase, companyId, docs)).get(key);
  }
  const origin = resolveOrigin(cur);
  return { ...origin, file_name: docs[0].file_name, basis: cur?.basis ?? null };
}

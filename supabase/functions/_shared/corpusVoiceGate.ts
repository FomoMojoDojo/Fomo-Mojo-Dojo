// VOICE-GATE — assertCorpusVoiceClassified: the chokepoint that BLOCKS the
// declared pipeline unless every contributing document is cleared as the client's
// voice. Sits at both declared upload seams (local-strategy-synthesis Gate 3b and
// local-jobmap-synthesis declared read), BEFORE any doc enters the declared brief
// and BEFORE any internal_declared write.
//
// Per-doc decision, over rows matched by EXACT (input_file_id, content_sha) — an
// edited/re-uploaded doc (new sha) has no matching row and reads as UNCLASSIFIED:
//   1. operator_override = 'client_voice'      → CLEARED   (declared; kept in brief)
//   2. operator_override = 'external'          → EXCLUDED  (dropped from brief; NOT
//                                                 a block — the operator adjudicated
//                                                 it out; routing it into an inferred
//                                                 read is a separate follow-on gate)
//   3. model verdict     = 'client_voice'      → CLEARED
//   4. model verdict     = 'external'|'uncertain' (no override) → BLOCKED
//   5. no sha-matched row at all               → BLOCKED (not classified)
//
// Any BLOCKED doc ⇒ the whole run REFUSES loudly with zero writes/model calls.
// uncertain never auto-passes. A corpus with zero contributing docs passes
// trivially (nothing was declared from an upload).

export type GateDoc = { input_file_id: string; content_sha: string; file_name: string };

export type CorpusVoiceGateResult =
  | { ok: true; cleared: GateDoc[]; excluded: GateDoc[] }
  | {
    ok: false;
    blocked: Array<{ input_file_id: string; file_name: string; reason: string }>;
    cleared: GateDoc[];
    excluded: GateDoc[];
    message: string;
  };

type VerdictRow = {
  input_file_id: string;
  content_sha: string;
  verdict: string;
  operator_override: string | null;
};

export async function assertCorpusVoiceClassified(
  supabase: { from: (t: string) => any },
  companyId: string,
  docs: GateDoc[],
): Promise<CorpusVoiceGateResult> {
  if (docs.length === 0) return { ok: true, cleared: [], excluded: [] };

  const { data, error } = await supabase
    .from("doc_voice_verdicts")
    .select("input_file_id, content_sha, verdict, operator_override")
    .eq("company_id", companyId)
    .in("input_file_id", docs.map((d) => d.input_file_id));
  if (error) throw new Error(`voice gate: doc_voice_verdicts read failed: ${error.message}`);

  // Index EXACT (input_file_id, content_sha) → {modelVerdict, override}.
  const byKey = new Map<string, { verdict: string | null; override: string | null }>();
  for (const row of (data ?? []) as VerdictRow[]) {
    const key = `${row.input_file_id}|${row.content_sha}`;
    const cur = byKey.get(key) ?? { verdict: null, override: null };
    if (row.operator_override === "client_voice" || row.operator_override === "external") {
      cur.override = row.operator_override;
    } else {
      cur.verdict = row.verdict;
    }
    byKey.set(key, cur);
  }

  const cleared: GateDoc[] = [];
  const excluded: GateDoc[] = [];
  const blocked: Array<{ input_file_id: string; file_name: string; reason: string }> = [];

  for (const d of docs) {
    const cur = byKey.get(`${d.input_file_id}|${d.content_sha}`);
    if (cur?.override === "client_voice") {
      cleared.push(d);
    } else if (cur?.override === "external") {
      excluded.push(d);
    } else if (cur?.verdict === "client_voice") {
      cleared.push(d);
    } else if (cur?.verdict === "external" || cur?.verdict === "uncertain") {
      blocked.push({ input_file_id: d.input_file_id, file_name: d.file_name, reason: `classified '${cur.verdict}' — not the client's voice (override required to proceed)` });
    } else {
      blocked.push({ input_file_id: d.input_file_id, file_name: d.file_name, reason: "not classified for this content (run classify-upload-voice, or the document was edited since it was classified)" });
    }
  }

  if (blocked.length > 0) {
    const detail = blocked.map((b) => `“${b.file_name}”: ${b.reason}`).join("; ");
    const message =
      `Voice gate refused: ${blocked.length} of ${docs.length} uploaded document(s) are not cleared as the client's voice, ` +
      `so the declared pipeline cannot run (CHANNEL ≠ VOICE — an upload is not proof the words are the client's). ` +
      `Classify or operator-override each before running the declared direction. Blocked — ${detail}.`;
    return { ok: false, blocked, cleared, excluded, message };
  }
  return { ok: true, cleared, excluded };
}

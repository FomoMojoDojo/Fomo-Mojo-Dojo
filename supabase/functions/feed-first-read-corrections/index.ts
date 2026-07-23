// First Read FR-D2 — feed-first-read-corrections.
//
// The corrections feed. After a First Read is issued, the presenter runs this to
// carry each client CORRECTION into the strategic Declared-vs-Observed reading.
// A correction is a statement the client spoke in the meeting that diverges from
// an observed finding; it enters the DECLARED corpus as a claims row and pairs
// against the observed public claim — the exact declared-vs-observed shape.
//
// LAWS (non-negotiable):
//   * MODEL-FREE / PRIVACY OPTION B: this feed makes ZERO model or network calls.
//     correction_text is client content and never leaves the box. Identity is pure
//     local crypto (contentIdentity / pairIdentity / silenceIdentity).
//   * FROZEN LEDGER READ-ONLY: first_read_responses is SELECT-only here. The feed
//     runs only on a session at proposal_issued or later (open = refuse).
//   * DIRECT STAMP (FR-D1): the correction claim is born provenance='client_attested'
//     stamped directly — never via deriveClaimProvenance, never the Gate 3b doc path.
//   * COEXIST-NEVER-MERGE: the attested claim id lives in its own namespace so a
//     same-text signal/public claim never collides. The ONLY precedence act is the
//     attestation-wins prune of a colliding claim_delta_rejections row.
//   * IDEMPOTENT: on-conflict-do-nothing on claims and deltas — feeding twice adds
//     nothing.
//   * PRE-PAIRED (Option A): the response already knows its target (item_identity),
//     so pairing is deterministic — no proposer/judge, no negative-cache tax.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { contentIdentity, normalizeForHash } from "../_shared/contentIdentity.ts";
import { pairIdentity, silenceIdentity } from "../_shared/claimDeltaSynthesis.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// FR-D1 attested id-namespace rule: a client-attested claim's deterministic id is
// UUIDv5-flavored over a DISTINCT namespace + segment, so a correction whose text
// equals a signal-derived or public claim can never collide with it (coexist,
// never merge). Mirrors _shared/evidencePhase1.ts deterministicSignalClaimId but
// in the 'client_attested' namespace, and normalizes via the TS content authority.
async function attestedClaimId(companyId: string, correctionText: string): Promise<string> {
  const NAMESPACE = "client-attested-claims-2026-07";
  const input = `${NAMESPACE}:${companyId}:client_attested:${normalizeForHash(correctionText)}`;
  const hashBuffer = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(input));
  const hash = new Uint8Array(hashBuffer);
  hash[6] = (hash[6] & 0x0f) | 0x50; // version 5
  hash[8] = (hash[8] & 0x3f) | 0x80; // RFC 4122 variant
  const h = Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

type CorrectionRow = {
  id: string;
  item_kind: string;
  item_ref: string | null;
  item_identity: string;
  item_text: string;
  correction_text: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { session_id } = await req.json().catch(() => ({}));
    if (!session_id) return json({ error: "session_id is required" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Session gate: issued-or-later only (the ledger is frozen there) ─────────
    const { data: session, error: sErr } = await supabase
      .from("first_read_sessions")
      .select("id, company_id, status")
      .eq("id", session_id)
      .maybeSingle();
    if (sErr) return json({ error: `session load failed: ${sErr.message}` }, 500);
    if (!session) return json({ error: "session not found" }, 404);
    if (session.status === "open") {
      return json({ error: "session is still open — issue the proposal before feeding corrections" }, 409);
    }
    const companyId = session.company_id as string;
    const nowIso = new Date().toISOString();

    // ── (a) Read the frozen corrections (SELECT-only) ───────────────────────────
    const { data: respData, error: rErr } = await supabase
      .from("first_read_responses")
      .select("id, item_kind, item_ref, item_identity, item_text, correction_text")
      .eq("session_id", session_id)
      .eq("verdict", "corrected");
    if (rErr) return json({ error: `responses load failed: ${rErr.message}` }, 500);
    const corrections = ((respData ?? []) as CorrectionRow[]).filter(
      (r) => typeof r.correction_text === "string" && r.correction_text.trim().length > 0,
    );

    // Honest-empty: no corrections in this session → nothing to feed, no writes.
    if (corrections.length === 0) {
      return json({ ok: true, session_id, corrections_fed: 0, paired: 0, silent: 0, rejections_pruned: 0, pruned_identities: [] });
    }

    // ── Observed side: this company's public_observed claims, indexed by content
    //    identity so a corrected item's finding resolves deterministically. ──────
    const { data: pubData, error: pErr } = await supabase
      .from("claims")
      .select("id, statement, status")
      .eq("company_id", companyId)
      .eq("provenance", "public_observed");
    if (pErr) return json({ error: `public claims load failed: ${pErr.message}` }, 500);
    const publicByIdentity = new Map<string, { id: string; statement: string }>();
    for (const c of (pubData ?? []) as Array<{ id: string; statement: string; status: string }>) {
      if (c.status === "struck") continue; // struck claims are out of the reading
      publicByIdentity.set(await contentIdentity(c.statement), { id: c.id, statement: c.statement });
    }

    let paired = 0, silent = 0, rejectionsPruned = 0;
    const prunedIdentities: string[] = [];

    for (const r of corrections) {
      const correctionText = (r.correction_text as string).trim();

      // ── (b) Birth the attested declared claim (idempotent, direct stamp) ──────
      const claimId = await attestedClaimId(companyId, correctionText);
      const { error: cErr } = await supabase.from("claims").upsert(
        {
          id: claimId,
          company_id: companyId,
          statement: correctionText, // verbatim
          provenance: "client_attested",
          raw_payload: {
            source: "first_read_correction",
            session_id,
            response_id: r.id,
            item_identity: r.item_identity,
            item_ref: r.item_ref,
          },
        },
        { onConflict: "id", ignoreDuplicates: true },
      );
      if (cErr) throw new Error(`attested claim upsert failed: ${cErr.message}`);

      // ── (c) Resolve finding → public_observed claim by content identity ───────
      const match = publicByIdentity.get(r.item_identity);

      if (match) {
        // Pre-paired DIVERGENT: the client corrected an observed finding.
        const identity = await pairIdentity(correctionText, match.statement);

        // ── (d) Attestation-wins prune: a stale model rejection of this exact
        //    pair identity is overruled by the client's attestation. ────────────
        const { data: rej } = await supabase
          .from("claim_delta_rejections")
          .select("id")
          .eq("company_id", companyId)
          .eq("content_identity", identity);
        if (rej && rej.length > 0) {
          const { error: pErr2 } = await supabase
            .from("claim_delta_rejections")
            .delete()
            .in("id", (rej as Array<{ id: string }>).map((x) => x.id));
          if (pErr2) throw new Error(`rejection prune failed: ${pErr2.message}`);
          rejectionsPruned += rej.length;
          prunedIdentities.push(identity);
        }

        const { error: dErr } = await supabase.from("claim_deltas").upsert(
          {
            company_id: companyId,
            declared_claim_id: claimId,
            public_claim_id: match.id,
            delta_type: "divergent",
            pairing_basis: "operator", // operator-attested, not model-judged
            judge_reason: `Client correction attested in First Read session ${session_id}`,
            content_identity: identity,
            computed_at: nowIso,
          },
          { onConflict: "company_id,content_identity", ignoreDuplicates: true },
        );
        if (dErr) throw new Error(`divergent delta upsert failed: ${dErr.message}`);
        paired++;
      } else {
        // No public echo → PUBLICLY_SILENT (declared, open question). Absence ≠
        // contradiction. No pair identity ⇒ no rejection to prune.
        const identity = await silenceIdentity("publicly_silent", correctionText);
        const { error: dErr } = await supabase.from("claim_deltas").upsert(
          {
            company_id: companyId,
            declared_claim_id: claimId,
            public_claim_id: null,
            delta_type: "publicly_silent",
            pairing_basis: "operator",
            judge_reason: `Client correction attested in First Read session ${session_id}`,
            content_identity: identity,
            computed_at: nowIso,
          },
          { onConflict: "company_id,content_identity", ignoreDuplicates: true },
        );
        if (dErr) throw new Error(`publicly_silent delta upsert failed: ${dErr.message}`);
        silent++;
      }
    }

    return json({
      ok: true,
      session_id,
      corrections_fed: corrections.length,
      paired,
      silent,
      rejections_pruned: rejectionsPruned,
      pruned_identities: prunedIdentities,
    });
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});

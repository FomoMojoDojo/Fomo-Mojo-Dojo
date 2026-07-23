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
import { deriveContests, type FeedResponse, type ObservedClaim } from "../_shared/contestFeed.ts";

// OC-2: a contest is a client-attested verdict AGAINST an observed finding. Its
// source stamp is the client-attested provenance origin — the only value the
// OC-1 claim_contests.source CHECK admits. Contests are born UNRESOLVED
// (resolution stays NULL); resolution is OC-3 and touches claims.status there,
// never here.
const CONTEST_SOURCE = "client_attested";

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

    // ── (a2) OC-2: read the frozen contest responses (reject / not_important) ────
    // Independent of corrections — a session may have contests but no corrections.
    const { data: contestRespData, error: crErr } = await supabase
      .from("first_read_responses")
      .select("id, verdict, item_identity")
      .eq("session_id", session_id)
      .in("verdict", ["rejected", "not_important"]);
    if (crErr) return json({ error: `contest responses load failed: ${crErr.message}` }, 500);
    const contestResponses = (contestRespData ?? []) as FeedResponse[];

    // Honest-empty: nothing to feed on EITHER axis → no writes at all.
    if (corrections.length === 0 && contestResponses.length === 0) {
      return json({
        ok: true, session_id,
        corrections_fed: 0, paired: 0, silent: 0, rejections_pruned: 0, pruned_identities: [],
        contests_born: 0, contests_disputed: 0, contests_immaterial: 0,
        contests_skipped: 0, contests_unanchored: 0,
      });
    }

    // ── Observed side: this company's public_observed claims, indexed by content
    //    identity so a corrected/contested item's finding resolves deterministically.
    //    The map value carries `identity` (its own key) so the OC-2 contest feed can
    //    stamp claim_identity without recomputing it. ─────────────────────────────
    const { data: pubData, error: pErr } = await supabase
      .from("claims")
      .select("id, statement, status")
      .eq("company_id", companyId)
      .eq("provenance", "public_observed");
    if (pErr) return json({ error: `public claims load failed: ${pErr.message}` }, 500);
    const publicByIdentity = new Map<string, { id: string; statement: string; identity: string }>();
    for (const c of (pubData ?? []) as Array<{ id: string; statement: string; status: string }>) {
      if (c.status === "struck") continue; // struck claims are out of the reading
      const identity = await contentIdentity(c.statement);
      publicByIdentity.set(identity, { id: c.id, statement: c.statement, identity });
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
          // Audit-hardening bundle: prune through the sanctioned RPC so the delete
          // is attributed 'attestation_wins' in claim_delta_rejection_removals
          // (a bare .delete() would audit as 'unaudited_direct_delete').
          const ids = (rej as Array<{ id: string }>).map((x) => x.id);
          const { error: pErr2 } = await supabase.rpc("remove_claim_delta_rejections", {
            p_ids: ids,
            p_reason: "attestation_wins",
          });
          if (pErr2) throw new Error(`rejection prune failed: ${pErr2.message}`);
          rejectionsPruned += ids.length;
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

    // ── (e) OC-2: birth contests from reject / not_important responses ──────────
    // ANCHORED-ONLY, IDEMPOTENT (skip-before-insert), MODEL-FREE. No claims write;
    // contests are born unresolved. deriveContests owns the law; we only INSERT the
    // rows it returns (which it already filtered against existing contests).
    const { data: existingContestData, error: ecErr } = await supabase
      .from("claim_contests")
      .select("claim_id")
      .eq("session_id", session_id);
    if (ecErr) return json({ error: `existing contests load failed: ${ecErr.message}` }, 500);
    const existingClaimIds = ((existingContestData ?? []) as Array<{ claim_id: string }>).map(
      (x) => x.claim_id,
    );

    const contestMap = publicByIdentity as unknown as Map<string, ObservedClaim>;
    const plan = deriveContests({
      responses: contestResponses,
      publicByIdentity: contestMap,
      existingClaimIds,
    });

    if (plan.births.length > 0) {
      // Plain INSERT (not upsert): deriveContests already skipped every existing
      // (session, claim), so a conflict here would be a real fault to surface — the
      // unique constraint is the backstop, never the dedup mechanism.
      const { error: insErr } = await supabase.from("claim_contests").insert(
        plan.births.map((b) => ({
          session_id,
          company_id: companyId,
          claim_id: b.claim_id,
          claim_identity: b.claim_identity,
          contest_kind: b.contest_kind,
          source: CONTEST_SOURCE,
        })),
      );
      if (insErr) throw new Error(`contest insert failed: ${insErr.message}`);
    }

    return json({
      ok: true,
      session_id,
      corrections_fed: corrections.length,
      paired,
      silent,
      rejections_pruned: rejectionsPruned,
      pruned_identities: prunedIdentities,
      contests_born: plan.births.length,
      contests_disputed: plan.disputed,
      contests_immaterial: plan.immaterial,
      contests_skipped: plan.skipped_existing,
      contests_unanchored: plan.unanchored,
    });
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});

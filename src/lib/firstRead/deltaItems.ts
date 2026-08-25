// V2-7 — Act 4 say-vs-see: assemble claim_delta rows into Check items (kind='delta').
//
// Pure. The SAY side is the client's declared statement; the SEE side is the outside
// record's reading. REGISTER LOCK on the see side (the render is the guard): the public
// claim must be public_observed (isPublicProvenance) and pass the framework/analytic voice
// guard (admitPublicPerception) — an analytic or internal see-side never renders here.
// Only the say-anchored groups (echoed / divergent / publicly_silent) enter this exhibit;
// internally_silent (the outside says something you didn't declare) has no say side.
//
// IDENTITY: a delta's identity is its content_identity (a pair/silence hash), a DISTINCT
// construction from a finding's contentIdentity(text) — so the two identity spaces do not
// collide by formula. The caller additionally DROPS any delta whose identity happens to
// equal a finding identity (collision detection), so the shared tally never conflates two
// items under one verdict row.

import { isPublicProvenance } from "@/lib/registerGuard";
import { admitPublicPerception } from "@/lib/firstRead/perceptionGuard";
import { isRelevanceStruck } from "@/lib/firstRead/relevanceActive";
import type { RawCheckItem } from "@/lib/firstRead/checkItems";

export interface DeltaInput {
  id: string;
  delta_type: string; // echoed | divergent | publicly_silent | internally_silent
  content_identity: string;
  declared_statement: string | null; // SAY (the client's declared words)
  public_statement: string | null; // SEE (the outside record's reading)
  public_provenance: string | null; // provenance of the public claim — must be public_observed
  quote: string | null; // verbatim receipt on the SEE side (CV-2e), or null
  quote_source_text: string | null;
  event_date: string | null;
  // Option B BACKING GUARD (read-side): true iff the observed claim has >=1 supporting
  // signal in the OUTSIDE band. A public_observed claim with no outside-band signal is our
  // own analysis mis-stamped; it must never render in the outside's voice. Only consulted
  // for internally_silent (the say-anchored groups already carry a public_observed see side).
  has_outside_signal?: boolean;
  // Reported-line date, quote-independent (the backing outside signal's date + capture).
  reported_event_date?: string | null;
  reported_precision?: "day" | "month" | null;
  captured_at?: string | null;
  // source_url of the SAME backing signal the reported date came from (same-signal invariant).
  source_url?: string | null;
  // RELEVANCE BACKSTOP: the machine relevance overlay (claim_deltas.relevance_verdict).
  // 'orthogonal' ⇒ struck (line-through, out of counts); NULL/'relevant' ⇒ active.
  relevance_verdict?: string | null;
}

// COLLISION DETECTION: drop any delta whose identity equals a non-delta (finding) item's
// identity. The shared verdict key is (session_id, item_identity) and the tally counts one
// row per identity — so two DIFFERENT items sharing an identity would conflate under one
// verdict. Delta identities (pair/silence hashes) don't collide with finding identities
// (text hashes) by formula; this is the belt-and-suspenders that guarantees it.
export function dropCollidingDeltas<T extends { identity?: string }>(deltas: T[], nonDeltaIdentities: Set<string>): T[] {
  return deltas.filter((d) => !!d.identity && !nonDeltaIdentities.has(d.identity));
}

const GROUP_TYPES = new Set(["echoed", "divergent", "publicly_silent"]);

export function assembleDeltaItems(deltas: DeltaInput[]): RawCheckItem[] {
  const items: RawCheckItem[] = [];
  for (const d of deltas) {
    // Option B — internally_silent is OBSERVED-anchored (no say side). Its item text is the
    // OBSERVED statement, register-locked exactly like a see side, plus the backing guard:
    // the observed claim must carry >=1 outside-band signal, or it is our own analysis
    // mis-stamped as the record and must not render in the outside's voice.
    if (d.delta_type === "internally_silent") {
      const observed = (d.public_statement ?? "").trim();
      if (!observed) continue; // no observed statement → nothing to render
      if (!isPublicProvenance(d.public_provenance)) continue; // analytic / internal see → excluded
      if (!admitPublicPerception(observed)) continue; // framework token / analytic voice → excluded
      if (!d.has_outside_signal) continue; // BACKING GUARD — no outside-band signal → excluded
      items.push({
        kind: "delta",
        ref: d.id,
        text: observed, // item_text frozen at capture = the OBSERVED statement being verdicted
        identity: d.content_identity,
        delta: {
          deltaType: "internally_silent",
          say: "", // no declared side
          see: observed,
          quote: d.quote,
          quoteSourceText: d.quote_source_text,
          eventDate: d.event_date,
          reportedEventDate: d.reported_event_date ?? null,
          reportedPrecision: d.reported_precision ?? null,
          capturedAt: d.captured_at ?? null,
          sourceUrl: d.source_url ?? null,
        },
      });
      continue;
    }

    if (!GROUP_TYPES.has(d.delta_type)) continue; // say-anchored groups only
    const say = (d.declared_statement ?? "").trim();
    if (!say) continue; // no declared side → not a say-vs-see item
    const see = (d.public_statement ?? "").trim();

    // publicly_silent legitimately has NO public claim (see empty — honest absence).
    // echoed / divergent MUST carry a register-clean public see side.
    if (d.delta_type !== "publicly_silent") {
      if (!see) continue;
      if (!isPublicProvenance(d.public_provenance)) continue; // internal/analytic see → excluded
      if (!admitPublicPerception(see)) continue; // framework token / analytic voice → excluded
      // RELEVANCE BACKSTOP (operator ruling 2026-08-25): a relevance-'orthogonal' echoed/divergent
      // pairing is OMITTED from the client render entirely (line-through retired) — same single
      // selector as beat 4. The verdict stays recorded/reversible in claim_deltas.
      if (isRelevanceStruck(d.relevance_verdict as "relevant" | "orthogonal" | null | undefined)) continue;
    }

    items.push({
      kind: "delta",
      ref: d.id,
      text: say, // item_text frozen at capture = the declared statement being verdicted
      identity: d.content_identity, // identity override (pair identity, not text-hash)
      delta: {
        deltaType: d.delta_type as "echoed" | "divergent" | "publicly_silent",
        say,
        see,
        quote: d.quote,
        quoteSourceText: d.quote_source_text,
        eventDate: d.event_date,
        reportedEventDate: d.reported_event_date ?? null,
        reportedPrecision: d.reported_precision ?? null,
        capturedAt: d.captured_at ?? null,
        sourceUrl: d.source_url ?? null,
      },
    });
  }
  return items;
}

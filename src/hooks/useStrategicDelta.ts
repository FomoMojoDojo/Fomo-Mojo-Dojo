import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DispositionValue = "intentional" | "queued";

export type DeltaSignal = {
  id: string;
  framework: string | null;
  claim_text: string;
  topic: string;
  rawPayload: Record<string, unknown>;
};

// PVT-2: public reads are grouped by SOURCE TYPE (who is speaking), with a
// humanized section label — not by identity/offering/market, and not headlined
// off sigs[0].claim_text (which surfaced thin strings like "Declared in page
// metadata (/)").
export type PublicTheme = {
  key: string;            // source_type (customer_review, employee_review, …)
  label: string;          // humanized section header
  signals: DeltaSignal[];
};

export type InternalGroups = {
  strategicBet: DeltaSignal[];      // strategy_cascade + null-framework authored
  recommendations: DeltaSignal[];   // teresa_torres | jtbd | odi  (company-internal hypotheses)
  sourceReads: DeltaSignal[];       // dify_summary  (behind disclosure)
};

// Run-over-run public-vs-internal alignment, straight from each run's
// result_json.message_alignment (no recompute). Ordered oldest → newest.
export type AlignmentPoint = {
  run_id: number;
  created_at: string;
  alignment_status: string | null;
  alignment_summary: string | null;
};

// PVT Phase 2: signal-level run-over-run delta in public voice. Source-level, honest
// (not inflated to signal counts). Identity key = normalized source_url (trim+lower
// only — distinct pages stay distinct). Endpoints only: baseline = min(source_id),
// current = max(source_id). Computed in-hook from rows already loaded; no LLM, no write.
export type DeltaSourceEntry = {
  url: string;           // normalized (trim + lowercase)
  host: string | null;   // for display
  tag: string;           // humanized source-type label
  claims: string[];      // claim_texts at this source in the relevant run
};
export type PublicVoiceDelta = {
  baselineRunId: number | null;
  currentRunId: number | null;
  newSources: DeltaSourceEntry[];      // current ∖ baseline
  droppedSources: DeltaSourceEntry[];  // baseline ∖ current (rows still exist — read only)
  shiftedSources: DeltaSourceEntry[];  // persisting source whose claim set moved (APPROXIMATE)
};

// INT-3: one rendered delta between an internal_declared and a public_observed
// claim (or a silence). Tri-state honesty: pairing_basis='judge_confirmed'
// renders plain, 'inferred' renders visibly labeled, 'operator' overrides both.
// operator_disposition='rejected_pairing' = tombstone (never re-proposed; the
// row stops rendering as a pair).
export type ClaimDeltaRow = {
  id: string;
  delta_type: "echoed" | "divergent" | "publicly_silent" | "internally_silent";
  pairing_basis: "judge_confirmed" | "inferred" | "operator";
  judge_reason: string | null;
  operator_disposition: "acknowledged" | "intentional" | "queued" | "rejected_pairing" | null;
  declared_statement: string | null;
  public_statement: string | null;
};

export type StrategicDeltaData = {
  internal: InternalGroups;
  publicThemes: PublicTheme[];
  dispositions: Map<string, DispositionValue>;
  // PVT-1: current public snapshot = the latest run that has outside signals.
  currentRunId: number | null;
  alignmentTrend: AlignmentPoint[];
  // PVT-2: source-level public-voice delta between baseline and current run.
  publicVoiceDelta: PublicVoiceDelta;
  // INT-3: persisted declared-vs-observed claim deltas (the founding signal).
  claimDeltas: ClaimDeltaRow[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Humanized section header per source type, most-independent voice first.
const SOURCE_TYPE_LABEL: Record<string, string> = {
  customer_review: "What customers say",
  employee_review: "What employees say",
  news_signal: "In the news",
  third_party_profile: "Third-party listings",
  community_discussion: "Community discussion",
  review_signal: "Reviews & ratings",
  profile_or_company_page: "What you say about yourself",
  public_web: "What the web says about you",
};
const SOURCE_TYPE_ORDER = [
  "customer_review", "employee_review", "news_signal", "community_discussion",
  "review_signal", "third_party_profile", "profile_or_company_page", "public_web",
];

function sourceTypeOf(sig: DeltaSignal): string {
  const st = typeof sig.rawPayload.source_type === "string" ? sig.rawPayload.source_type.trim() : "";
  // 'analysis' is the synthesis terminal-fallback stamp (findings layer) — render it
  // in the same bucket blank source_type uses today (public_web), net-zero change.
  if (st && st !== "analysis") return st;
  const bucket = typeof sig.rawPayload.bucket === "string" ? sig.rawPayload.bucket.trim() : "";
  // outside_voice_signal is a bucket, not a source type — fall back to web.
  if (bucket && bucket !== "outside_voice_signal") return bucket;
  return "public_web";
}

function humanizeSourceType(key: string): string {
  return SOURCE_TYPE_LABEL[key]
    ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function groupPublicBySourceType(signals: DeltaSignal[]): PublicTheme[] {
  const groups = new Map<string, DeltaSignal[]>();
  for (const sig of signals) {
    const st = sourceTypeOf(sig);
    if (!groups.has(st)) groups.set(st, []);
    groups.get(st)!.push(sig);
  }
  const rank = (k: string) => {
    const i = SOURCE_TYPE_ORDER.indexOf(k);
    return i === -1 ? SOURCE_TYPE_ORDER.length : i;
  };
  return [...groups.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([key, sigs]) => ({ key, label: humanizeSourceType(key), signals: sigs }));
}

function toRaw(payload: unknown): Record<string, unknown> {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  return {};
}

// PVT-2 identity normalization: trim + lowercase ONLY — do not strip path/query, so
// distinct pages remain distinct sources.
function normalizeUrl(u: unknown): string {
  return String(u ?? "").trim().toLowerCase();
}
function deltaHostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

// Direct signal reader — NOT claim-mediated.
// Internal query: signal_band='organization', topic='strategy' (D+A gate at 82b7c7b keeps
// opportunities-topic signals out).
// Public query: signal_band='outside', source_type='public_baseline_run'.
// Dispositions: delta_dispositions table, one row per signal per operator adjudication.
export function useStrategicDelta(companyId?: string) {
  const queryClient = useQueryClient();
  const queryKey = ["strategic-delta", companyId];

  const query = useQuery({
    queryKey,
    enabled: Boolean(companyId),
    staleTime: 60_000,
    queryFn: async (): Promise<StrategicDeltaData> => {
      if (!companyId) return {
        internal: { strategicBet: [], recommendations: [], sourceReads: [] },
        publicThemes: [],
        dispositions: new Map(),
        currentRunId: null,
        alignmentTrend: [],
        publicVoiceDelta: { baselineRunId: null, currentRunId: null, newSources: [], droppedSources: [], shiftedSources: [] },
        claimDeltas: [],
      };

      const [internalRes, publicRes, dispRes, runsRes, deltaRes, claimRes] = await Promise.all([
        supabase
          .from("signals")
          .select("id, framework, claim_text, topic, raw_payload")
          .eq("company_id", companyId)
          .eq("signal_band", "organization")
          .eq("topic", "strategy")
          .order("created_at", { ascending: true }),
        supabase
          .from("signals")
          .select("id, framework, claim_text, topic, raw_payload, source_id, source_url")
          .eq("company_id", companyId)
          .eq("signal_band", "outside")
          .eq("source_type", "public_baseline_run")
          .order("created_at", { ascending: true }),
        // delta_dispositions not yet in generated types — cast to bypass
        (supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> })
          .from("delta_dispositions")
          .select("signal_id, disposition")
          .eq("company_id", companyId),
        // PVT-1: per-run public-vs-internal alignment trend (no recompute).
        supabase
          .from("public_baseline_runs")
          .select("id, created_at, result_json")
          .eq("company_id", companyId)
          .order("id", { ascending: true }),
        // INT-3: persisted claim deltas + the claims they reference.
        supabase
          .from("claim_deltas")
          .select("id, delta_type, pairing_basis, judge_reason, operator_disposition, declared_claim_id, public_claim_id")
          .eq("company_id", companyId)
          .order("delta_type", { ascending: true }),
        supabase
          .from("claims")
          .select("id, statement")
          .eq("company_id", companyId),
      ]);

      const claimStatementById = new Map<string, string>(
        ((claimRes.data ?? []) as Array<{ id: string; statement: string }>).map((c) => [c.id, c.statement]),
      );
      const claimDeltas: ClaimDeltaRow[] = ((deltaRes.data ?? []) as Array<{
        id: string;
        delta_type: ClaimDeltaRow["delta_type"];
        pairing_basis: ClaimDeltaRow["pairing_basis"];
        judge_reason: string | null;
        operator_disposition: ClaimDeltaRow["operator_disposition"];
        declared_claim_id: string | null;
        public_claim_id: string | null;
      }>).map((r) => ({
        id: r.id,
        delta_type: r.delta_type,
        pairing_basis: r.pairing_basis,
        judge_reason: r.judge_reason,
        operator_disposition: r.operator_disposition,
        declared_statement: r.declared_claim_id ? claimStatementById.get(r.declared_claim_id) ?? null : null,
        public_statement: r.public_claim_id ? claimStatementById.get(r.public_claim_id) ?? null : null,
      }));

      const toDeltaSignal = (r: {
        id: string;
        framework: string | null;
        claim_text: string;
        topic: string | null;
        raw_payload: unknown;
      }): DeltaSignal => ({
        id: String(r.id),
        framework: r.framework ?? null,
        claim_text: String(r.claim_text ?? ""),
        topic: String(r.topic ?? ""),
        rawPayload: toRaw(r.raw_payload),
      });

      const internalSignals = (internalRes.data ?? []).map(toDeltaSignal);

      const internal: InternalGroups = {
        strategicBet:    internalSignals.filter(s =>
          s.framework === "strategy_cascade" || s.framework === null),
        recommendations: internalSignals.filter(s =>
          s.framework === "teresa_torres" || s.framework === "jtbd" || s.framework === "odi"),
        sourceReads:     internalSignals.filter(s => s.framework === "dify_summary"),
      };

      // PVT-1: current public snapshot = the latest run that actually has outside
      // signals. Resolve from the signals themselves (max source_id) so a failed /
      // empty later run can't blank the panel. Was: union of ALL runs (the blob).
      const publicRows = (publicRes.data ?? []) as Array<Record<string, unknown>>;
      // Run ids: ignore rows with a blank/non-numeric source_id. (Number("") === 0 is
      // finite, so a blank source_id would otherwise inject a phantom "run 0" — which
      // min() would wrongly pick as the PVT-2 baseline.)
      const runIds = publicRows
        .map((r) => String(r.source_id ?? "").trim())
        .filter((s) => s !== "")
        .map((s) => Number(s))
        .filter((n) => Number.isFinite(n) && n > 0);
      const currentRunId = runIds.length > 0 ? Math.max(...runIds) : null;
      const currentRows = currentRunId === null
        ? publicRows
        : publicRows.filter((r) => Number(r.source_id) === currentRunId);
      // F-2: synthesis reads (source_type='analysis') leave the public-voice panel —
      // they now live in StandingFindings (auto-captured at ingest). Voice (WEB · host)
      // + company-stated reads stay. (The 'analysis'→public_web mapping in sourceTypeOf
      // is now unreachable for the panel; left as a harmless backstop.)
      const voiceRows = currentRows.filter((r) => {
        const rp = r.raw_payload as { source_type?: unknown } | null;
        return !(rp && typeof rp.source_type === "string" && rp.source_type.trim() === "analysis");
      });
      const publicSignals = voiceRows.map((r) => toDeltaSignal(r as Parameters<typeof toDeltaSignal>[0]));
      const publicThemes = groupPublicBySourceType(publicSignals);

      // PVT-2: source-level run-over-run delta (endpoints: baseline = min run, current = max).
      // Diffs VOICE rows only (same analysis-exclusion as the panel), keyed on normalized
      // source_url. No LLM, no write — pure set arithmetic over rows already loaded.
      const isVoiceRow = (r: Record<string, unknown>) => {
        const rp = r.raw_payload as { source_type?: unknown } | null;
        return !(rp && typeof rp.source_type === "string" && rp.source_type.trim() === "analysis");
      };
      const baselineRunId = runIds.length > 0 ? Math.min(...runIds) : null;
      const indexSourcesByUrl = (rows: Array<Record<string, unknown>>) => {
        const m = new Map<string, { rawUrl: string; tag: string; claims: Set<string> }>();
        for (const r of rows) {
          const rawUrl = String(r.source_url ?? "");
          const u = normalizeUrl(rawUrl);
          if (!u) continue;
          if (!m.has(u)) {
            const tag = humanizeSourceType(sourceTypeOf(toDeltaSignal(r as Parameters<typeof toDeltaSignal>[0])));
            m.set(u, { rawUrl, tag, claims: new Set<string>() });
          }
          const claim = String(r.claim_text ?? "").trim().toLowerCase();
          if (claim) m.get(u)!.claims.add(claim);
        }
        return m;
      };
      const toEntry = (u: string, v: { rawUrl: string; tag: string; claims: Set<string> }): DeltaSourceEntry => ({
        url: u,
        host: deltaHostOf(v.rawUrl || u),
        tag: v.tag,
        claims: [...v.claims],
      });
      let publicVoiceDelta: PublicVoiceDelta = {
        baselineRunId, currentRunId, newSources: [], droppedSources: [], shiftedSources: [],
      };
      // Only meaningful with ≥2 distinct runs (baseline must differ from current).
      if (baselineRunId !== null && currentRunId !== null && baselineRunId !== currentRunId) {
        const baselineRows = publicRows.filter((r) => Number(r.source_id) === baselineRunId && isVoiceRow(r));
        const baseIdx = indexSourcesByUrl(baselineRows);
        const currIdx = indexSourcesByUrl(voiceRows);
        const newSources: DeltaSourceEntry[] = [];
        const shiftedSources: DeltaSourceEntry[] = [];
        for (const [u, v] of currIdx) {
          if (!baseIdx.has(u)) newSources.push(toEntry(u, v));
          else if (!setsEqual(v.claims, baseIdx.get(u)!.claims)) shiftedSources.push(toEntry(u, v));
        }
        const droppedSources: DeltaSourceEntry[] = [];
        for (const [u, v] of baseIdx) if (!currIdx.has(u)) droppedSources.push(toEntry(u, v));
        publicVoiceDelta = { baselineRunId, currentRunId, newSources, droppedSources, shiftedSources };
      }

      const dispositions = new Map<string, DispositionValue>();
      for (const row of (dispRes.data ?? []) as Array<{ signal_id: string; disposition: string }>) {
        if (row.disposition === "intentional" || row.disposition === "queued") {
          dispositions.set(row.signal_id, row.disposition as DispositionValue);
        }
      }

      const alignmentTrend: AlignmentPoint[] = (
        (runsRes.data ?? []) as Array<{ id: number; created_at: string; result_json: unknown }>
      ).map((run) => {
        const ma = (run.result_json as {
          message_alignment?: { alignment_status?: unknown; alignment_summary?: unknown };
        } | null)?.message_alignment ?? null;
        return {
          run_id: Number(run.id),
          created_at: String(run.created_at ?? ""),
          alignment_status: ma?.alignment_status != null ? String(ma.alignment_status) : null,
          alignment_summary: ma?.alignment_summary != null ? String(ma.alignment_summary) : null,
        };
      });

      return { internal, publicThemes, dispositions, currentRunId, alignmentTrend, publicVoiceDelta, claimDeltas };
    },
  });

  async function setDisposition(signalId: string, value: DispositionValue | null) {
    if (!companyId) return;
    if (value === null) {
      await (supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> })
        .from("delta_dispositions")
        .delete()
        .eq("signal_id", signalId)
        .eq("company_id", companyId);
    } else {
      await (supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> })
        .from("delta_dispositions")
        .upsert({ company_id: companyId, signal_id: signalId, disposition: value }, { onConflict: "signal_id" });
    }
    queryClient.invalidateQueries({ queryKey });
  }

  // INT-3: operator disposition on a claim delta. 'rejected_pairing' is the
  // "not a pair" tombstone — persisted here, respected forever by recompute
  // (the synthesis core never re-proposes a tombstoned content_identity).
  // Every set stamps operator_seen_at (the acknowledge-by-seeing law).
  async function setClaimDeltaDisposition(
    deltaId: string,
    value: "acknowledged" | "intentional" | "queued" | "rejected_pairing" | null,
  ) {
    if (!companyId) return;
    await supabase
      .from("claim_deltas")
      .update({ operator_disposition: value, operator_seen_at: new Date().toISOString() })
      .eq("id", deltaId)
      .eq("company_id", companyId);
    queryClient.invalidateQueries({ queryKey });
  }

  return { ...query, setDisposition, setClaimDeltaDisposition };
}

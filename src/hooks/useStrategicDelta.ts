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

export type PublicTheme = {
  key: "identity" | "offering" | "market";
  label: string;
  headline: string;
  signals: DeltaSignal[];
};

export type InternalGroups = {
  strategicBet: DeltaSignal[];      // strategy_cascade + null-framework authored
  recommendations: DeltaSignal[];   // teresa_torres | jtbd | odi  (company-internal hypotheses)
  sourceReads: DeltaSignal[];       // dify_summary  (behind disclosure)
};

export type StrategicDeltaData = {
  internal: InternalGroups;
  publicThemes: PublicTheme[];
  dispositions: Map<string, DispositionValue>;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function bucketToTheme(bucket: string | null, topic: string): "identity" | "offering" | "market" {
  const s = (bucket ?? topic).toLowerCase();
  if (/product|offering|service|inventory|roast|coffee/.test(s)) return "offering";
  if (/market|competitive|adoption|buyer|customer|switching/.test(s) || topic === "market") return "market";
  return "identity";
}

function groupPublicByTheme(signals: DeltaSignal[]): PublicTheme[] {
  const buckets = new Map<"identity" | "offering" | "market", DeltaSignal[]>([
    ["identity", []],
    ["offering", []],
    ["market",   []],
  ]);
  for (const sig of signals) {
    const bucket = typeof sig.rawPayload.bucket === "string" ? sig.rawPayload.bucket : null;
    const theme = bucketToTheme(bucket, sig.topic);
    buckets.get(theme)!.push(sig);
  }
  const labels: Record<string, string> = { identity: "Identity", offering: "Offering", market: "Market" };
  const result: PublicTheme[] = [];
  for (const [key, sigs] of buckets) {
    if (sigs.length === 0) continue;
    result.push({
      key,
      label: labels[key],
      headline: sigs[0].claim_text.slice(0, 120),
      signals: sigs,
    });
  }
  return result;
}

function toRaw(payload: unknown): Record<string, unknown> {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  return {};
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
      };

      const [internalRes, publicRes, dispRes] = await Promise.all([
        supabase
          .from("signals")
          .select("id, framework, claim_text, topic, raw_payload")
          .eq("company_id", companyId)
          .eq("signal_band", "organization")
          .eq("topic", "strategy")
          .order("created_at", { ascending: true }),
        supabase
          .from("signals")
          .select("id, framework, claim_text, topic, raw_payload")
          .eq("company_id", companyId)
          .eq("signal_band", "outside")
          .eq("source_type", "public_baseline_run")
          .order("created_at", { ascending: true }),
        // delta_dispositions not yet in generated types — cast to bypass
        (supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> })
          .from("delta_dispositions")
          .select("signal_id, disposition")
          .eq("company_id", companyId),
      ]);

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

      const publicSignals = (publicRes.data ?? []).map(toDeltaSignal);
      const publicThemes = groupPublicByTheme(publicSignals);

      const dispositions = new Map<string, DispositionValue>();
      for (const row of (dispRes.data ?? []) as Array<{ signal_id: string; disposition: string }>) {
        if (row.disposition === "intentional" || row.disposition === "queued") {
          dispositions.set(row.signal_id, row.disposition as DispositionValue);
        }
      }

      return { internal, publicThemes, dispositions };
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

  return { ...query, setDisposition };
}

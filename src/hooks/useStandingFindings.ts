import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Findings layer (read-side). Standing findings persist across snapshots until
// resolved — a distinct tier from the current snapshot (PVT-1) and run-over-run
// delta (PVT-2). Reads the findings store directly (NOT useStrategicDelta's
// snapshot query). Runs under the app's admin session, which RLS requires.

export type FindingBeats = { observe: string; name_tension: string; open: string };

export type Finding = {
  id: string;
  origin_run_id: number | null;
  origin_signal_id: string | null;
  kind: "observation" | "watch_out" | "frontier";
  body: string;
  beats: FindingBeats | null; // second-person three-beat; display the Observe, fall back to body
  status: "open" | "resolved";
  created_at: string;
  host: string | null; // provenance host, derived from the origin signal url when present
  // Origin-signal provenance (CV-2c date badges) — read-only enrichment.
  sourceUrl: string | null; // full origin-signal url
  signalCapturedAt: string | null; // signals.created_at (capture time)
  signalRawDate: string | null; // signals.raw_payload->>'date' (genuine source date when present)
};

export type StandingFindingsData = {
  findings: Finding[];
  primaryId: string | null;
  // The company's own domain — used to suppress same-domain provenance hosts
  // (synthesis reads are stamped with the company website as source_url).
  companyDomain: string | null;
};

// findings / operator_primary_selection are not in the generated Database types yet.
const db = supabase as unknown as {
  from: (t: string) => ReturnType<typeof supabase.from>;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown }>;
};

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function useStandingFindings(companyId?: string) {
  const queryClient = useQueryClient();
  const queryKey = ["standing-findings", companyId];

  const query = useQuery({
    queryKey,
    enabled: Boolean(companyId),
    staleTime: 60_000,
    queryFn: async (): Promise<StandingFindingsData> => {
      if (!companyId) return { findings: [], primaryId: null, companyDomain: null };

      const [openRes, primaryRes, companyRes] = await Promise.all([
        db.from("findings")
          .select("id, origin_run_id, origin_signal_id, kind, body, beats, status, created_at")
          .eq("company_id", companyId)
          .eq("status", "open")
          .order("created_at", { ascending: true }),
        db.rpc("find_primary_finding", { p_company_id: companyId }),
        db.from("companies").select("website").eq("id", companyId).maybeSingle(),
      ]);

      const companyWebsite = (companyRes as { data?: { website?: unknown } | null }).data?.website;
      const companyDomain = typeof companyWebsite === "string" && companyWebsite
        ? hostOf(companyWebsite)
        : null;

      const rows = (openRes.data ?? []) as Array<
        Omit<Finding, "host" | "sourceUrl" | "signalCapturedAt" | "signalRawDate">
      >;

      // Enrich provenance (host, url, capture time, source date) from each
      // finding's origin signal (when it has one).
      const signalIds = rows.map((r) => r.origin_signal_id).filter((x): x is string => Boolean(x));
      type SignalMeta = { host: string | null; url: string | null; capturedAt: string | null; rawDate: string | null };
      const metaById = new Map<string, SignalMeta>();
      if (signalIds.length > 0) {
        const { data: sigs } = await db
          .from("signals")
          .select("id, source_url, raw_payload, created_at")
          .in("id", signalIds);
        for (const s of ((sigs ?? []) as Array<{ id: string; source_url: string | null; raw_payload: Record<string, unknown> | null; created_at: string | null }>)) {
          const rawUrl = s.raw_payload && typeof (s.raw_payload as { url?: unknown }).url === "string"
            ? String((s.raw_payload as { url?: unknown }).url)
            : "";
          const url = String(s.source_url || rawUrl || "");
          const rawDate = s.raw_payload && typeof (s.raw_payload as { date?: unknown }).date === "string"
            ? String((s.raw_payload as { date?: unknown }).date)
            : null;
          metaById.set(s.id, {
            host: url ? hostOf(url) : null,
            url: url || null,
            capturedAt: s.created_at ?? null,
            rawDate,
          });
        }
      }

      const findings: Finding[] = rows.map((r) => {
        const meta = r.origin_signal_id ? metaById.get(r.origin_signal_id) : undefined;
        return {
          ...r,
          host: meta?.host ?? null,
          sourceUrl: meta?.url ?? null,
          signalCapturedAt: meta?.capturedAt ?? null,
          signalRawDate: meta?.rawDate ?? null,
        };
      });

      const primaryData = (primaryRes as { data?: unknown }).data;
      const primaryRow = Array.isArray(primaryData) ? primaryData[0] : primaryData;
      const primaryId = primaryRow && (primaryRow as { id?: unknown }).id
        ? String((primaryRow as { id: unknown }).id)
        : null;

      return { findings, primaryId, companyDomain };
    },
  });

  async function markPrimary(id: string) {
    if (!companyId) return;
    await db.from("operator_primary_selection").upsert(
      { company_id: companyId, domain: "finding", item_id: id, chosen_at: new Date().toISOString() },
      { onConflict: "company_id,domain" },
    );
    await queryClient.invalidateQueries({ queryKey });
  }

  async function resolve(id: string) {
    await db.from("findings").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", id);
    await queryClient.invalidateQueries({ queryKey });
  }

  return { data: query.data, isLoading: query.isLoading, markPrimary, resolve };
}

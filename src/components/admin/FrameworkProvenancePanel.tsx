import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MetaBadge, ScoreChip } from "@/components/ui/semantic-badges";

type ArtifactKey = "inputs" | "job_steps" | "opportunities" | "routes";

type ProvenanceRow = {
  frameworks_used: string[] | null;
};

type ArtifactSummary = {
  artifact: ArtifactKey;
  count: number;
  frameworkCounts: Array<{ key: string; count: number }>;
  stackCounts: Array<{ stack: string; count: number }>;
};

const LABELS: Record<ArtifactKey, string> = {
  inputs: "Inputs",
  job_steps: "Job Steps",
  opportunities: "Opportunities",
  routes: "Routes",
};

function normalizeStack(frameworks: string[] | null | undefined) {
  return (frameworks ?? []).filter(Boolean);
}

async function fetchArtifactRows(artifact: ArtifactKey, companyId: string) {
  const { data, error } = await supabase
    .from(artifact)
    .select("frameworks_used")
    .eq("company_id", companyId)
    .limit(500);

  if (error) {
    if (error.message.toLowerCase().includes("frameworks_used")) {
      return [];
    }
    throw error;
  }
  return (data ?? []) as ProvenanceRow[];
}

function summarizeArtifact(artifact: ArtifactKey, rows: ProvenanceRow[]): ArtifactSummary {
  const frameworkCounter = new Map<string, number>();
  const stackCounter = new Map<string, number>();

  for (const row of rows) {
    const stack = normalizeStack(row.frameworks_used);

    for (const framework of stack) {
      frameworkCounter.set(framework, (frameworkCounter.get(framework) ?? 0) + 1);
    }

    const stackKey = stack.length > 0 ? stack.join(" -> ") : "none";
    stackCounter.set(stackKey, (stackCounter.get(stackKey) ?? 0) + 1);
  }

  return {
    artifact,
    count: rows.length,
    frameworkCounts: Array.from(frameworkCounter.entries())
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)),
    stackCounts: Array.from(stackCounter.entries())
      .map(([stack, count]) => ({ stack, count }))
      .sort((a, b) => b.count - a.count || a.stack.localeCompare(b.stack)),
  };
}

export default function FrameworkProvenancePanel({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName: string;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<ArtifactSummary[]>([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        const [inputs, jobSteps, opportunities, routes] = await Promise.all([
          fetchArtifactRows("inputs", companyId),
          fetchArtifactRows("job_steps", companyId),
          fetchArtifactRows("opportunities", companyId),
          fetchArtifactRows("routes", companyId),
        ]);

        if (cancelled) return;

        setSummaries([
          summarizeArtifact("inputs", inputs),
          summarizeArtifact("job_steps", jobSteps),
          summarizeArtifact("opportunities", opportunities),
          summarizeArtifact("routes", routes),
        ]);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load framework provenance");
        setSummaries([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const totalArtifacts = useMemo(
    () => summaries.reduce((sum, item) => sum + item.count, 0),
    [summaries]
  );

  return (
    <section className="bg-white border border-border rounded-2xl p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="font-sans text-[14px] font-semibold text-foreground">
            Framework Provenance
          </div>
          <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
            Internal-only audit view for {companyName}
          </div>
        </div>
        <ScoreChip label="Rows" value={totalArtifacts} />
      </div>

      {loading ? (
        <div className="py-8 text-center font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
          Loading provenance…
        </div>
      ) : error ? (
        <div className="py-8 text-center font-sans text-[14px] text-danger">
          Failed to load provenance: {error}
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {summaries.map((summary) => (
            <div key={summary.artifact} className="rounded-xl border border-border bg-muted/10 p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="font-sans text-[13px] font-semibold text-foreground">
                  {LABELS[summary.artifact]}
                </div>
                <ScoreChip label="Rows" value={summary.count} />
              </div>

              <div className="space-y-3">
                <div>
                  <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-wide mb-2">
                    Frameworks Used
                  </div>
                  {summary.frameworkCounts.length === 0 ? (
                    <p className="font-sans text-[13px] text-muted-foreground italic">
                      No provenance stored yet.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {summary.frameworkCounts.map((item) => (
                        <div key={`${summary.artifact}-${item.key}`} className="flex items-center gap-2">
                          <MetaBadge>{item.key}</MetaBadge>
                          <ScoreChip label="n" value={item.count} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-wide mb-2">
                    Stack Signatures
                  </div>
                  {summary.stackCounts.length === 0 ? (
                    <p className="font-sans text-[13px] text-muted-foreground italic">
                      No stack signatures yet.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {summary.stackCounts.slice(0, 3).map((item) => (
                        <div
                          key={`${summary.artifact}-${item.stack}`}
                          className="rounded-lg border border-border bg-white px-3 py-2"
                        >
                          <div className="mb-2">
                            <ScoreChip label="Rows" value={item.count} />
                          </div>
                          <div className="font-sans text-[12px] text-foreground mt-1 break-words">
                            {item.stack}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

import { ledgerItemFingerprint } from "@/lib/scoring/mojoScore";
import type { BaselineLedgerItem } from "@/lib/scoring/mojoScore";

export type AffectedArtifact = "Positioning" | "Strategy" | "Needs" | "Routes";

// Maps a bucket substring (lower-cased) to the artifact types it influences.
// Order matters: more-specific prefixes first.
const BUCKET_ARTIFACT_MAP: Array<{ match: string; artifacts: AffectedArtifact[] }> = [
  { match: "position",  artifacts: ["Positioning"] },
  { match: "compet",    artifacts: ["Positioning", "Routes"] },
  { match: "strateg",   artifacts: ["Strategy"] },
  { match: "market",    artifacts: ["Routes", "Strategy"] },
  { match: "jtbd",      artifacts: ["Needs", "Routes"] },
  { match: "customer",  artifacts: ["Needs", "Routes"] },
];

const ALL_ARTIFACTS: AffectedArtifact[] = ["Positioning", "Strategy", "Needs", "Routes"];

export function classifyBucketArtifacts(bucket: string | undefined): AffectedArtifact[] {
  const b = String(bucket ?? "").toLowerCase().trim();
  if (!b) return ALL_ARTIFACTS;
  for (const { match, artifacts } of BUCKET_ARTIFACT_MAP) {
    if (b.includes(match)) return artifacts;
  }
  return ALL_ARTIFACTS;
}

export interface ExclusionImpact {
  excludedCount: number;
  affectedBuckets: string[];
  affectedArtifacts: AffectedArtifact[];
  // Generic string set so callers can cast to their own tab key union
  affectedTabKeys: ReadonlySet<string>;
}

export const RESTORE_GUIDANCE: Record<AffectedArtifact, string> = {
  Positioning: "Run updated market research to revalidate how the category and alternatives are framed.",
  Strategy: "Re-run outside signals baseline to refresh strategy inputs from public sources.",
  Needs: "Conduct customer interviews to validate which needs remain most important.",
  Routes: "Review route recommendations after restoring or replacing excluded outside signals.",
};

export function computeLatestExclusionAt(
  excluded: Array<{ excluded_at?: string }>,
): Date | null {
  let latest: Date | null = null;
  for (const e of excluded) {
    if (!e.excluded_at) continue;
    const d = new Date(e.excluded_at);
    if (!Number.isNaN(d.getTime()) && (!latest || d > latest)) {
      latest = d;
    }
  }
  return latest;
}

export function isArtifactStale(
  row: { updated_at?: unknown; generated_at?: unknown; created_at?: unknown },
  latestExclusionAt: Date,
): boolean {
  const ts = row.updated_at ?? row.generated_at ?? row.created_at;
  if (!ts) return false;
  const d = new Date(String(ts));
  return !Number.isNaN(d.getTime()) && d < latestExclusionAt;
}

export function computeExclusionImpact(
  ledger: BaselineLedgerItem[],
  excludedSet: ReadonlySet<string>,
  tabForArtifact?: Record<AffectedArtifact, string>,
): ExclusionImpact {
  const excluded = ledger.filter((item) => excludedSet.has(ledgerItemFingerprint(item)));
  const excludedCount = excluded.length;

  const bucketSet = new Set<string>();
  const artifactSet = new Set<AffectedArtifact>();

  for (const item of excluded) {
    const bucket = String(item.bucket ?? "").toLowerCase().trim();
    if (bucket) bucketSet.add(bucket);
    for (const a of classifyBucketArtifacts(item.bucket)) {
      artifactSet.add(a);
    }
  }

  const affectedArtifacts = Array.from(artifactSet);
  const affectedTabKeys = new Set<string>(
    tabForArtifact ? affectedArtifacts.map((a) => tabForArtifact[a]) : [],
  );

  return {
    excludedCount,
    affectedBuckets: Array.from(bucketSet),
    affectedArtifacts,
    affectedTabKeys,
  };
}

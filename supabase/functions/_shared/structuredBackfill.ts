// STRUCTURED BACKFILL — pure (no Deno, no DB). Operator ruling 2026-09-04 (ruling 1): an ok fetch whose body hash
// is already stored mints no snapshot row (unique index), so the captured structured block is backfilled onto the
// existing rows with the IDENTICAL hash whose structured IS NULL. Never overwrites a stored block, never touches a
// different hash. The runner and the crawl door both derive their UPDATE from this one predicate.
import type { StructuredBlock } from "./listingDetect.ts";
export type SnapshotStructuredRow = { id: string; text_sha256: string; structured: unknown | null };

export function structuredBackfillTargets(rows: SnapshotStructuredRow[], liveHash: string, block: StructuredBlock | null | undefined): string[] {
  if (!block) return [];
  return rows.filter((r) => r.text_sha256 === liveHash && (r.structured === null || r.structured === undefined)).map((r) => r.id);
}

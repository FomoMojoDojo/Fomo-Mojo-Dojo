// RELEVANCE BACKSTOP — the SINGLE shared selector for the relevance overlay (build gate 2026-08-26).
// MOVED (operator ruling 5, 2026-09-18) to supabase/functions/_shared/relevanceActive.ts so the public-read
// generator can import the same predicate on the edge runtime (which mounts _shared, not new src/lib files).
// This module re-exports it unchanged for every client importer — one authority, no copy.
export {
  isPairAdmissible, isRelevanceActive, isRelevanceStruck, RELEVANCE_ORTHOGONAL,
  type AdmissiblePair, type RelevanceVerdict,
} from "../../../supabase/functions/_shared/relevanceActive.ts";

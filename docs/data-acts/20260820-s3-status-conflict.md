# Data act — S3 status-conflict detector

**Date:** 2026-08-20
**Company:** CB2 (`fd3f7f63-968b-4698-b946-3d6b6450d79d`)
**Pre-write dump:** `~/backups/pre-s3-20260820.sql` — md5 `fb0263163df21703d2f92d9063d28d7e`

## Schema (migration `20260820260000_status_conflict_questions.sql`)
`first_read_open_questions.source_kind` admits `'status_conflict'` (BOTH historical check
constraints updated) + new `conflict_sources jsonb` + `conflict_location text`.

## Detector (`detect-status-conflict`, deterministic — `_shared/statusConflict.ts`)
Per tracked location entity: if ≥1 AUTHORITATIVE source (google/yelp/apple/corner.inc/tripadvisor)
is `operating_status` closed AND ≥1 signal (any host) is operating-framed with event/read date ≥
the earliest closure date → upsert a `status_conflict` open question with both source sets attached
(host · date · quote), content-identity keyed, preserve-on-upsert. Never a verdict.
Falsification tests (`statusConflict.test.ts`, 6): closed+open→one; closed-only→none;
closure-older-than-open→still fires; non-authoritative-closed→none; stale-open-only→none.

## Result
- **CB2 fires — exactly ONE question** for *Le French Rooster & Cafe Barra (2221 W Olive Ave,
  Burbank)*: "Some sources say {location} is closed; others still list it as open. Which is true
  today?" closure_date **2026-04-19**; **5 authoritative closed** sources (corner.inc + yelp.com);
  **38 operating-framed** sources (cafebarra.com, joe.coffee, lefrenchrooster.com, postmates.com,
  restaurant.com, ubereats.com). Idempotent: re-run refreshes, never duplicates.
- **Edgewood:** does NOT fire (no closure). **CB1:** untouched (0 questions).
- No verdict rendered; no signal/claim/finding superseded or hidden.

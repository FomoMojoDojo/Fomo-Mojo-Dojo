# Lovable static-snapshot frontend (Edgewood)

This branch (`lovable-snapshot`) is the whole MojoMap client-refine app wired to
render from a **committed, point-in-time snapshot of one company (Edgewood)** with
**no backend** — so Lovable can explore the design against real MojoMap data
instead of inventing off-model placeholders.

It is the approved **a+c hybrid**: a committed `edgewood.snapshot.json` consumed by
a fixture-backed mock Supabase client, swapped in at the single `client.ts` seam.

## How it works

- `src/integrations/supabase/edgewood.snapshot.json` — the Edgewood-only data
  (23 tables scoped to `company_id='3dd2cfbb…'`; `raw_payload` stripped from
  `signals`/`claims`/`surface_proposals`/`strategic_hypotheses`; **no secrets**).
- `src/integrations/supabase/fixtureClient.ts` — `makeFixtureClient(snapshot)`: an
  in-memory mock of the Supabase query builder. Reads resolve from the snapshot;
  writes (e.g. the route-choose control) mutate the in-memory copy only;
  `functions.invoke`/`rpc` return benign `{ data: null }` so action buttons render
  but no-op silently.
- `src/integrations/supabase/client.ts` — the switch:

  ```ts
  export const supabase = HAS_SUPABASE_CREDENTIALS
    ? createClient(...)                 // real backend
    : makeFixtureClient(edgewoodSnapshot); // fixture
  ```

## Gate integrity (load-bearing)

The fixture path activates **only** when `HAS_SUPABASE_CREDENTIALS === false`, i.e.
when neither `VITE_SUPABASE_URL` nor `VITE_SUPABASE_PUBLISHABLE_KEY` is set. This
branch commits **no** Supabase creds, so a Lovable deploy has no creds → fixture.
Any environment that DOES have creds (prod, local Tailscale dev) gets the real
client and never constructs the mock — the snapshot cannot leak into a live render.
`usePresentationMode` defaults to `"internal"` in fixture mode so the admin-only
`/preview/client-refine*` routes render on load (admin is handled by the existing
`!HAS_SUPABASE_CREDENTIALS` preview-admin path in `useAuth`).

**Do not commit a `.env` with `VITE_SUPABASE_*` on this branch** — that would flip
the switch to the real client and break the snapshot.

## Refreshing the snapshot (known step — it WILL go stale)

When Edgewood's data or the schema moves, re-run one command against the local
Edgewood-reachable stack, then re-push:

```sh
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_SERVICE_ROLE_KEY=<local service role key> \
deno run --allow-net --allow-env --allow-write scripts/capture-edgewood-snapshot.ts

git add src/integrations/supabase/edgewood.snapshot.json
git commit -m "refresh edgewood snapshot"
git push origin lovable-snapshot
```

The capture is **read-only** against Edgewood and strips `raw_payload`. The service
key comes from env at run time and is never committed.

## Known-empty surfaces (empty in the live DB too — real resting state)

`strategic_hypotheses` (home §02 chips), `surface_educational_content` ("About this
section"), `methodology_pages` — all empty for Edgewood, so no fidelity loss.

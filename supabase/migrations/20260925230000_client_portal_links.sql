-- B1 (Notion "Client Portals" sync, rulings 1–11) — the storage for the per-company sync switch
-- and the client status. Storage + the operator section only: NO sync code, NO Notion call, NO
-- launchd job, NO token. B2 (sync script, dry run) and B3 (launchd) are separate briefs.
--
-- R-store — ONE ROW PER COMPANY IN A NEW TABLE; `companies` IS NOT ALTERED.
-- The census at d4415018 found no per-company client-status or external-ID column, and the
-- nearest-looking column, `companies.program_phase`, is a DIFFERENT concept: an 8-state
-- engagement-posture model (outside_signals → … → validate_flow) that gates what surfaces
-- render, normalised on read to `engagement_phase` with an `engagement_phase_set` tri-state.
-- Reusing it would collapse "where this engagement is" into "what Notion says", and the
-- seven Notion values are not in its CHECK. It is not touched by this migration or by the UI.
--
-- WHY A SEPARATE TABLE AND NOT COLUMNS ON `companies`:
--   1. `companies` carries the enforce_frozen_company_row trigger, which refuses ANY column
--      change on a frozen row. Adding sync state there would make CB1's sync fields permanently
--      unwritable in a way that reads as a bug rather than as a rule.
--   2. Sync-owned bookkeeping (last_synced_at, last_sync_error, …) is written by a service-role
--      job; keeping it off `companies` keeps that job's blast radius to one table.
--   3. The absence of a row is itself the honest record of "never considered for sync", which a
--      NOT NULL DEFAULT false column on `companies` could not express (every company would read
--      as an explicit "no").
--
-- R-status — client_status holds EXACTLY the seven Notion single-select values, or NULL for
-- not-set. The CHECK is the DB's copy of Notion's option list; it is duplicated onto
-- last_notion_status_seen so a value that could never have come from Notion cannot be recorded
-- as having come from Notion.
--
-- R-frozen — the enforce_company_freeze trigger (migration 20260810120000, already on 96
-- company_id-bearing tables) is attached BEFORE INSERT OR UPDATE OR DELETE. CB1
-- (58b2b15b-bada-4bcd-9c12-b7e66a37d0bc, companies.frozen = true) therefore cannot get a row
-- at all: the DB refuses it, independently of the UI, which never renders the section for a
-- frozen company. Two gates, neither relying on the other.
--
-- R-cas — compare-and-set is the WRITER's contract, expressed as the UPDATE's WHERE clause
-- (`... AND client_status IS NOT DISTINCT FROM <the value the writer read>`), not as a DB
-- constraint. status_changed_at records when the stored value last actually changed hands, so a
-- lost update is visible after the fact and not only at the moment it is refused.
--
-- status_changed_at IS STAMPED BY A TRIGGER, NOT BY THE WRITER. B1 specifies `status_changed_at =
-- now()` on every status write. A browser writer goes through PostgREST, which cannot put now() in
-- an UPDATE payload — it could only send its own clock, so a skewed laptop would date a status
-- change wrongly and R3's newest-change-wins would resolve on that wrong date. The trigger below
-- stamps server now() whenever client_status actually changes hands, which is the same observable
-- outcome from a clock that cannot be wrong, and it holds for EVERY writer: the UI, B2's sync, and
-- psql alike. Consequence for the UI: it never sends status_changed_at, so the only two columns it
-- ever writes are `enabled` and `client_status`.
--
-- SYNC-OWNED COLUMNS: map_created_set_at, last_synced_at, last_sync_error, last_sync_error_at.
-- The UI never writes them (enforced in the component, which sends only `enabled`,
-- `client_status` and `status_changed_at`). NOTE, for B2 to decide: the admin RLS policy below
-- is FOR ALL, mirroring `companies`, so an admin browser session is not DB-prevented from
-- writing them. No such trigger is added here because none was signed; if B2 wants the column
-- ownership enforced rather than observed, that is a one-trigger follow-up.
--
-- RLS: the same admin predicate `companies` itself uses — has_role(auth.uid(), 'admin'::app_role)
-- — FOR ALL, plus service-role full access (the integrity_runs pattern). NO member policy and NO
-- public policy: unlike integrity_runs, this table carries no client-visible content, so a
-- company member has nothing to read here.
--
-- Additive only. Creates one table; alters nothing. No backfill: no company has been flagged
-- for sync yet, and an absent row is the correct record of that.

BEGIN;

CREATE TABLE IF NOT EXISTS public.client_portal_links (
  -- company_id IS the primary key: R-store's "one row per company", enforced by the PK rather
  -- than by a separate UNIQUE on a surrogate id that a second row could still slip past.
  company_id              uuid        PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,

  -- R1: the operator-only switch. Only flagged companies sync.
  enabled                 boolean     NOT NULL DEFAULT false,

  -- R-status: exactly the seven Notion single-select values, or NULL = not set.
  client_status           text            NULL,
  status_changed_at       timestamptz     NULL,

  -- The Notion row this company is linked to. UNIQUE so two MojoMap companies can never be
  -- pointed at one Notion page (the duplicate-Edgewood shape the census found is exactly the
  -- way that would otherwise happen). NULL until a sync creates or links the row.
  notion_page_id          text            NULL UNIQUE,

  -- What Notion last reported, for R3's newest-change-wins comparison. Same value set as
  -- client_status.
  last_notion_status_seen text            NULL,

  -- Sync-owned. The UI never writes these four.
  map_created_set_at      timestamptz     NULL,
  last_synced_at          timestamptz     NULL,
  last_sync_error         text            NULL,
  last_sync_error_at      timestamptz     NULL,

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  -- R-status, stated once per column so the error names which column was wrong.
  CONSTRAINT client_portal_links_client_status_check CHECK (
    client_status IS NULL OR client_status IN (
      'Cold Intake', 'Web Intake', 'Map Created', 'In Progress', 'Completed', 'On Hold', 'Ongoing'
    )
  ),
  CONSTRAINT client_portal_links_last_notion_status_seen_check CHECK (
    last_notion_status_seen IS NULL OR last_notion_status_seen IN (
      'Cold Intake', 'Web Intake', 'Map Created', 'In Progress', 'Completed', 'On Hold', 'Ongoing'
    )
  )
);

COMMENT ON TABLE public.client_portal_links IS
  'One row per company flagged for the Notion "Client Portals" sync (B1). companies is never altered; companies.program_phase is a different concept and is never read or written here.';
COMMENT ON COLUMN public.client_portal_links.enabled IS
  'R1 operator-only switch. Only flagged companies sync. A company with no row here has never been considered.';
COMMENT ON COLUMN public.client_portal_links.client_status IS
  'R-status. Exactly the seven Notion single-select values, or NULL = not set. Every write is compare-and-set (R-cas).';
COMMENT ON COLUMN public.client_portal_links.status_changed_at IS
  'Server now(), stamped by trg_client_portal_links_stamp_status_changed whenever client_status changes hands. No writer sets it directly; a value sent by a writer is overwritten.';
COMMENT ON COLUMN public.client_portal_links.notion_page_id IS
  'The linked Notion page. UNIQUE: two companies can never point at one Notion row.';
COMMENT ON COLUMN public.client_portal_links.last_notion_status_seen IS
  'R3. What Notion last reported, for newest-change-wins. Same seven values as client_status.';
COMMENT ON COLUMN public.client_portal_links.map_created_set_at IS
  'SYNC-OWNED (R4). When the sync set "Map Created" in Notion. The UI never writes this.';
COMMENT ON COLUMN public.client_portal_links.last_synced_at IS
  'SYNC-OWNED. The UI never writes this.';
COMMENT ON COLUMN public.client_portal_links.last_sync_error IS
  'SYNC-OWNED. The UI never writes this.';
COMMENT ON COLUMN public.client_portal_links.last_sync_error_at IS
  'SYNC-OWNED. The UI never writes this.';

-- company freeze, same as every company_id-bearing table (migration 20260810120000).
-- R-frozen: this is what refuses a CB1 row at the DB.
CREATE TRIGGER enforce_company_freeze
  BEFORE INSERT OR DELETE OR UPDATE ON public.client_portal_links
  FOR EACH ROW EXECUTE FUNCTION public.enforce_company_freeze();

-- R-cas bookkeeping: server now() whenever client_status actually changes hands. `IS DISTINCT
-- FROM` is the test, so a re-save of the same value is not recorded as a change, and a write that
-- only touches `enabled` never disturbs the status date.
CREATE OR REPLACE FUNCTION public.client_portal_links_stamp_status_changed()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.client_status IS NOT NULL THEN NEW.status_changed_at := now(); END IF;
    RETURN NEW;
  END IF;
  IF NEW.client_status IS DISTINCT FROM OLD.client_status THEN
    NEW.status_changed_at := now();
  ELSE
    NEW.status_changed_at := OLD.status_changed_at;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_client_portal_links_stamp_status_changed
  BEFORE INSERT OR UPDATE ON public.client_portal_links
  FOR EACH ROW EXECUTE FUNCTION public.client_portal_links_stamp_status_changed();

-- updated_at, the existing convention (inputs / mojo_maps / methodology_pages).
CREATE TRIGGER update_client_portal_links_updated_at
  BEFORE UPDATE ON public.client_portal_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.client_portal_links ENABLE ROW LEVEL SECURITY;

-- The same predicate `companies` uses, verbatim, so "who may operate this" cannot drift from
-- "who may operate a company".
CREATE POLICY "Admins can do everything with client_portal_links"
  ON public.client_portal_links
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "service role full access on client_portal_links"
  ON public.client_portal_links
  FOR ALL
  USING (auth.role() = 'service_role'::text)
  WITH CHECK (auth.role() = 'service_role'::text);

-- No member policy and no public policy: nothing here is client-visible.

COMMIT;

-- RLS-2 — member-scope the three tables the RLS-1 audit flagged SUSPICIOUS
-- (non-tautology defects that needed a design ruling before a fix).
--
-- OPERATOR MODEL (ratified, supersedes the three separate rulings):
--   * client members see ONLY their own company;
--   * FMD admins see everything (the existing has_role admin backstops);
--   * NO creator-only scoping — the RLS-1 market_options predicate's
--     companies.created_by disjunct is deliberately NOT imported here.
-- Within-company granularity (owner/FMD allowances) is the queued 3-tier role
-- gate, not this one.
--
-- The membership predicate is RLS-1's, minus the created_by term:
--     EXISTS (SELECT 1 FROM company_members cm
--             WHERE cm.company_id = <tbl>.company_id AND cm.user_id = auth.uid())
--   OR has_role(auth.uid(), 'admin'::app_role)
--
-- Policies only. ZERO DML. Admin backstops on all three tables are left intact.

-- ── 1. deep_dive_analyses ────────────────────────────────────────────────────
-- Was: (auth.uid() = user_id) OR admin OR (company_id IN (SELECT c.id FROM
-- companies c)) — the third disjunct matched EVERY company (unbounded subquery,
-- no auth predicate). ONLY that disjunct is replaced, by the membership EXISTS.
-- The own-row author term and the admin backstop are preserved verbatim — a
-- minimal, faithful swap of the one broken clause.
DROP POLICY IF EXISTS "Users can view company deep dive analyses" ON public.deep_dive_analyses;
CREATE POLICY "Users can view company deep dive analyses" ON public.deep_dive_analyses
  FOR SELECT TO authenticated
  USING (
    (auth.uid() = user_id)
    OR (EXISTS ( SELECT 1 FROM company_members cm
                 WHERE cm.company_id = deep_dive_analyses.company_id AND cm.user_id = auth.uid()))
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- ── 2. company_run_locks ─────────────────────────────────────────────────────
-- Was: qual = true (any authenticated user read every company's locks).
-- Diagnostic (RLS-2 checkpoint): every coordination read is either service-role
-- (edge functions, bypass RLS) or a per-company `.eq(company_id)` UI check under
-- a member/admin JWT; the ONE cross-company read is AdminCompanies' active-lock
-- dashboard, which is admin-gated and, being a SELECT, is row-FILTERED by RLS
-- rather than errored. No coordination path reads cross-company under a
-- non-admin JWT, so member-scoping is safe.
DROP POLICY IF EXISTS "Users can view company run locks" ON public.company_run_locks;
CREATE POLICY "Users can view company run locks" ON public.company_run_locks
  FOR SELECT TO authenticated
  USING (
    (EXISTS ( SELECT 1 FROM company_members cm
              WHERE cm.company_id = company_run_locks.company_id AND cm.user_id = auth.uid()))
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- ── 3. profiles ──────────────────────────────────────────────────────────────
-- Was: "Authenticated users can view profile names" qual = true — every user's
-- display_name readable by any authenticated user, across all tenants. Replaced
-- with own-profile OR admin OR shares-a-company. Row-scope only (no view): the
-- only content column is display_name, which must be visible to co-members; the
-- real exposure was row breadth, not columns. The separate "Users can view own
-- profile" policy is left as-is (its OR-union is subsumed here, harmlessly).
-- Accepted: the "MojoMap System" profile (member of no company) becomes visible
-- to admins only.
--
-- WHY A SECURITY DEFINER HELPER, not an inline JOIN. company_members has its own
-- RLS — "user sees own row OR admin" — so an inline `company_members them` join
-- inside this USING clause runs under the CALLER's privileges and can only see
-- the caller's OWN membership. The shares-a-company branch would be DEAD for
-- every non-admin: a member could not see even a genuine co-member. Proven live
-- during this gate (Alice saw only herself, not her Edgewood co-members).
-- shares_company_with is SECURITY DEFINER so the overlap is computed past
-- company_members' RLS — the identical pattern has_role/has_capability already
-- use, and the ONLY correct way to express cross-row membership visibility here.
CREATE OR REPLACE FUNCTION public.shares_company_with(_other uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM company_members me
    JOIN company_members them ON them.company_id = me.company_id
    WHERE me.user_id = auth.uid() AND them.user_id = _other
  )
$function$;

DROP POLICY IF EXISTS "Authenticated users can view profile names" ON public.profiles;
CREATE POLICY "Authenticated users can view profile names" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    (user_id = auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role)
    OR shares_company_with(profiles.user_id)
  );

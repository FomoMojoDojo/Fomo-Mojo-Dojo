const PREVIEW_FLAG = String(import.meta.env.VITE_ENABLE_CLIENT_REFINE_PREVIEW ?? "")
  .trim()
  .toLowerCase();

// FRONT DOOR (2026-09-09). The bare path is the companies inventory in the First Read design; the
// former landing (MojoMap home) moved one level down to /home. Every "Home" nav link points at /home;
// the front door is reached by "All companies".
export const CLIENT_REFINE_PREVIEW_ROUTE = "/preview/client-refine";
export const CLIENT_REFINE_PREVIEW_HOME_ROUTE = "/preview/client-refine/home";
export const CLIENT_REFINE_PREVIEW_ROUTES_ROUTE = "/preview/client-refine/routes";
export const CLIENT_REFINE_PREVIEW_WORKSHOP_ROUTE = "/preview/client-refine/workshop";
export const CLIENT_REFINE_PREVIEW_PATH_ROUTE = "/preview/client-refine/path";
// N1 (2026-09-26). The Company operator view is ADDRESSED BY COMPANY. Before this it took its
// company from CompanyProvider alone, so the URL named no company: a bookmark or a pasted link
// opened whichever company that browser profile happened to have selected last, and there was no
// way to send a colleague "Edgewood's Company page". The bare path is kept as a redirect to the
// active company (see App.tsx) so every existing link, and the Workshop's ?advance banner, still
// land somewhere correct.
export const CLIENT_REFINE_PREVIEW_COMPANY_ROUTE = "/preview/client-refine/company";
export const CLIENT_REFINE_PREVIEW_COMPANY_ID_ROUTE = `${CLIENT_REFINE_PREVIEW_COMPANY_ROUTE}/:companyId`;

/** The Company view for one company. Without an id, the bare path (which redirects to the active one). */
export function clientRefineCompanyPath(companyId?: string | null) {
  return companyId ? `${CLIENT_REFINE_PREVIEW_COMPANY_ROUTE}/${companyId}` : CLIENT_REFINE_PREVIEW_COMPANY_ROUTE;
}

/**
 * N1 — where the BARE /preview/client-refine/company sends the operator. Pure, so the rule is
 * assertable without mounting the router.
 *
 * `null` = NOT YET KNOWABLE (the company list is still loading). The caller renders nothing rather
 * than redirecting, because activeCompany is null during the first fetch and bouncing then would
 * send every arrival to the front door on a race.
 *
 * No active company ⇒ the front door, never a guessed company: answering "whichever one this
 * browser last happened to select" is the behaviour N1 exists to end.
 *
 * The query string travels: the Workshop's phase banner arrives here as ?advance=diagnose and the
 * confirm flow on the far side reads it.
 */
export function bareCompanyRedirect(args: {
  loading: boolean;
  activeCompanyId: string | null | undefined;
  search: string;
}): string | null {
  if (args.loading) return null;
  if (!args.activeCompanyId) return CLIENT_REFINE_PREVIEW_ROUTE;
  return `${clientRefineCompanyPath(args.activeCompanyId)}${args.search}`;
}

/**
 * N3 — the id a company-parameterised route should make active, or `null` to leave the provider
 * alone. Pure, for the same reason.
 *
 * Leaves it alone when: there is no id in the route, the provider already holds it (so the effect
 * cannot loop), or the id is not one this operator holds. That last case matters most — an unknown
 * id written here would be persisted to localStorage and would follow the operator onto every
 * other surface, long after the bad link that produced it.
 */
export function routeCompanyToActivate(args: {
  routeCompanyId: string | null | undefined;
  activeCompanyId: string | null | undefined;
  knownCompanyIds: readonly string[];
}): string | null {
  const { routeCompanyId, activeCompanyId, knownCompanyIds } = args;
  if (!routeCompanyId) return null;
  if (activeCompanyId === routeCompanyId) return null;
  if (!knownCompanyIds.includes(routeCompanyId)) return null;
  return routeCompanyId;
}
export const CLIENT_REFINE_PREVIEW_INBOX_ROUTE = "/preview/client-refine/inbox";
export const CLIENT_REFINE_PREVIEW_MEMBERS_ROUTE = "/preview/client-refine/members";
export const CLIENT_REFINE_PREVIEW_EXTRACTS_ROUTE = "/preview/client-refine/extracts";
// 8-beat client-facing first read, company-parameterized (R3: coexists with
// the presenter-driven /first-read/:id V2 flow, which stays untouched).
export const CLIENT_REFINE_PREVIEW_FIRSTREAD_BASE = "/preview/client-refine/first-read";
export const CLIENT_REFINE_PREVIEW_FIRSTREAD_ROUTE = `${CLIENT_REFINE_PREVIEW_FIRSTREAD_BASE}/:companyId`;

export function clientRefineFirstReadPath(companyId: string) {
  return `${CLIENT_REFINE_PREVIEW_FIRSTREAD_BASE}/${companyId}`;
}

// Mark link-back (FM9, commit 3, 2026-09-22): the first read opens on the beat a mark sits on and scrolls
// its row into view. The value is the mark's anchor id — "<anchor_kind>|<anchor_key>", the same composition
// anchorId() makes. An id the company does not hold is not an error: the read opens normally, silently.
export const FIRSTREAD_MARK_PARAM = "mark";

export function clientRefineFirstReadMarkPath(companyId: string, markAnchorId: string) {
  return `${clientRefineFirstReadPath(companyId)}?${FIRSTREAD_MARK_PARAM}=${encodeURIComponent(markAnchorId)}`;
}

// WORKSPACE (2026-09-11). A nested route family under one shell (the First Read language):
// /workspace is the index; the nine pages are children. Company comes from CompanyProvider
// (the active company), never a URL param — same as every sibling except the First Read.
export const CLIENT_REFINE_PREVIEW_WORKSPACE_ROUTE = "/preview/client-refine/workspace";

export function clientRefineWorkspacePath(page?: string) {
  return page ? `${CLIENT_REFINE_PREVIEW_WORKSPACE_ROUTE}/${page}` : CLIENT_REFINE_PREVIEW_WORKSPACE_ROUTE;
}

export function isClientRefinePreviewPath(pathname: string) {
  return (
    pathname === CLIENT_REFINE_PREVIEW_ROUTE ||
    pathname === CLIENT_REFINE_PREVIEW_HOME_ROUTE ||
    pathname === CLIENT_REFINE_PREVIEW_ROUTES_ROUTE ||
    pathname === CLIENT_REFINE_PREVIEW_WORKSHOP_ROUTE ||
    pathname === CLIENT_REFINE_PREVIEW_PATH_ROUTE ||
    pathname === CLIENT_REFINE_PREVIEW_COMPANY_ROUTE ||
    pathname.startsWith(`${CLIENT_REFINE_PREVIEW_COMPANY_ROUTE}/`) ||
    pathname === CLIENT_REFINE_PREVIEW_INBOX_ROUTE ||
    pathname === CLIENT_REFINE_PREVIEW_MEMBERS_ROUTE ||
    pathname === CLIENT_REFINE_PREVIEW_EXTRACTS_ROUTE ||
    pathname === CLIENT_REFINE_PREVIEW_WORKSPACE_ROUTE ||
    pathname.startsWith(`${CLIENT_REFINE_PREVIEW_WORKSPACE_ROUTE}/`) ||
    pathname.startsWith(`${CLIENT_REFINE_PREVIEW_FIRSTREAD_BASE}/`)
  );
}

export function isClientRefinePreviewEnabled() {
  if (import.meta.env.DEV) {
    return PREVIEW_FLAG !== "false" && PREVIEW_FLAG !== "0" && PREVIEW_FLAG !== "off";
  }
  return PREVIEW_FLAG === "true" || PREVIEW_FLAG === "1" || PREVIEW_FLAG === "on";
}

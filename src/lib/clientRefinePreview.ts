const PREVIEW_FLAG = String(import.meta.env.VITE_ENABLE_CLIENT_REFINE_PREVIEW ?? "")
  .trim()
  .toLowerCase();

export const CLIENT_REFINE_PREVIEW_ROUTE = "/preview/client-refine";
export const CLIENT_REFINE_PREVIEW_ROUTES_ROUTE = "/preview/client-refine/routes";
export const CLIENT_REFINE_PREVIEW_WORKSHOP_ROUTE = "/preview/client-refine/workshop";
export const CLIENT_REFINE_PREVIEW_PATH_ROUTE = "/preview/client-refine/path";
export const CLIENT_REFINE_PREVIEW_COMPANY_ROUTE = "/preview/client-refine/company";
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

export function isClientRefinePreviewPath(pathname: string) {
  return (
    pathname === CLIENT_REFINE_PREVIEW_ROUTE ||
    pathname === CLIENT_REFINE_PREVIEW_ROUTES_ROUTE ||
    pathname === CLIENT_REFINE_PREVIEW_WORKSHOP_ROUTE ||
    pathname === CLIENT_REFINE_PREVIEW_PATH_ROUTE ||
    pathname === CLIENT_REFINE_PREVIEW_COMPANY_ROUTE ||
    pathname === CLIENT_REFINE_PREVIEW_INBOX_ROUTE ||
    pathname === CLIENT_REFINE_PREVIEW_MEMBERS_ROUTE ||
    pathname === CLIENT_REFINE_PREVIEW_EXTRACTS_ROUTE ||
    pathname.startsWith(`${CLIENT_REFINE_PREVIEW_FIRSTREAD_BASE}/`)
  );
}

export function isClientRefinePreviewEnabled() {
  if (import.meta.env.DEV) {
    return PREVIEW_FLAG !== "false" && PREVIEW_FLAG !== "0" && PREVIEW_FLAG !== "off";
  }
  return PREVIEW_FLAG === "true" || PREVIEW_FLAG === "1" || PREVIEW_FLAG === "on";
}

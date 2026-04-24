const PREVIEW_FLAG = String(import.meta.env.VITE_ENABLE_CLIENT_REFINE_PREVIEW ?? "")
  .trim()
  .toLowerCase();

export const CLIENT_REFINE_PREVIEW_ROUTE = "/preview/client-refine";
export const CLIENT_REFINE_PREVIEW_ROUTES_ROUTE = "/preview/client-refine/routes";

export function isClientRefinePreviewPath(pathname: string) {
  return pathname === CLIENT_REFINE_PREVIEW_ROUTE || pathname === CLIENT_REFINE_PREVIEW_ROUTES_ROUTE;
}

export function isClientRefinePreviewEnabled() {
  if (import.meta.env.DEV) {
    return PREVIEW_FLAG !== "false" && PREVIEW_FLAG !== "0" && PREVIEW_FLAG !== "off";
  }
  return PREVIEW_FLAG === "true" || PREVIEW_FLAG === "1" || PREVIEW_FLAG === "on";
}

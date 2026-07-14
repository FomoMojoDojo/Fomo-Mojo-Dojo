// Route + shell config for the client-facing "story mode" surface (CV-0).
// This is the first true CLIENT-facing surface — distinct from the existing
// site, which (with its INTERNAL/CLIENT presentation toggle) is now the
// INTERNAL view. Same data hooks will feed it in later gates; CV-0 is chrome
// and palette shell only. Convention mirrors clientRefinePreview.ts.

export const CLIENT_VIEW_ROUTE = "/client-view";

export function isClientStoryPath(pathname: string) {
  return pathname === CLIENT_VIEW_ROUTE;
}

// Persistence key for the story-mode chrome (per design reference).
// (The palette key was removed with the neutral palette — warm is the only
// palette per the CV-2 amendment.)
export const CLIENT_STORY_THEME_KEY = "mm-theme"; // 'dark' | 'light' (default dark)

export type ClientStoryTheme = "dark" | "light";

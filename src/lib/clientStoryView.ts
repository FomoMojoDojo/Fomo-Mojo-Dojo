// Route + shell config for the client-facing "story mode" surface (CV-0).
// This is the first true CLIENT-facing surface — distinct from the existing
// site, which (with its INTERNAL/CLIENT presentation toggle) is now the
// INTERNAL view. Same data hooks will feed it in later gates; CV-0 is chrome
// and palette shell only. Convention mirrors clientRefinePreview.ts.

export const CLIENT_VIEW_ROUTE = "/client-view";

export function isClientStoryPath(pathname: string) {
  return pathname === CLIENT_VIEW_ROUTE;
}

// Persistence keys for the story-mode chrome (per design reference).
export const CLIENT_STORY_THEME_KEY = "mm-theme"; // 'dark' | 'light' (default dark)
export const CLIENT_STORY_PALETTE_KEY = "mm-palette"; // 'neutral' | 'warm' (default neutral)

export type ClientStoryTheme = "dark" | "light";
export type ClientStoryPalette = "neutral" | "warm";

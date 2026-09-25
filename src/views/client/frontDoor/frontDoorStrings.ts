// The FRONT DOOR's words (/preview/client-refine), signed by the operator.
//
// The page had no strings module until 4g-1: its words were literals inside FrontDoorView. They are
// collected here so the new "Workspace" link is signed the same way every other door's words are,
// and frontDoorStrings.parity.test.ts pins them verbatim. Moving a literal into a constant changes
// no rendered word — FrontDoorView.test.tsx still asserts the page's output unchanged.
export const FRONT_DOOR_STRINGS = {
  /** The header title. */
  allCompanies: "All companies",
  /** The right-hand slot — the way back to the old site. */
  legacySite: "Legacy site",
  /** Shown over an EMPTY table when the inventory query fails. */
  loadFailed: "Couldn't load companies — try reloading.",
  /** 4g-1 (signed 2026-09-25) — the row's second link: that company's workspace home. The row's own
   *  click still opens the First Read; this is the only way into the workspace from anywhere. */
  workspace: "Workspace",
} as const;

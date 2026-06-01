/**
 * MojoMap design tokens as JS constants.
 * Use these in inline styles, which are safe inside Radix portals.
 * CSS variables from mojomap-tokens.css are NOT available in portals.
 */
export const D = {
  ink:           "#111111",
  inkSoft:       "#555555",
  inkFaint:      "#999999",
  signal:        "#ff5b29",
  canvas:        "#ffffff",
  hairline:      "rgba(17,17,17,0.12)",
  hairlineFaint: "rgba(17,17,17,0.08)",
  mono:          '"IBM Plex Mono", ui-monospace, monospace',
  sans:          '"Inter", system-ui, sans-serif',
} as const;

export type DesignTokens = typeof D;

// The sign-in page's own copy (S-U6-7 … S-U6-9, signed 2026-11-10).
//
// WHY THESE MOVED OUT OF THE COMPONENT. U6-55 sends every signed-out visitor here, including a
// company member who has never seen the admin side of this product. The page used to say "Admin
// Login" over "CMS Access", which told a client that the thing they were invited to is for
// administrators. The register has to be neutral, and the only way a string stays signed is for it
// to live somewhere a parity test can read it.
//
// Verbatim, as signed. The parity test beside this file is what keeps them that way.
export const LOGIN_STRINGS = {
  /** U6-59 — the wordmark, with the mark. Was "MOJO MAP", letter-spaced and uppercased in CSS. */
  wordmark: "MojoMap\u2122",
  /** S-U6-7 — the page heading, replacing 'Admin Login'. */
  heading: "Sign in to MojoMap™",
  /** S-U6-8 — the line under the heading, replacing 'CMS Access'. */
  subheading: "Enter your email and password",
  /** S-U6-9 — shown only when Supabase credentials are absent, replacing the 'admin access' wording. */
  previewMode: "Preview mode: Supabase credentials are not configured, so sign-in is local-only.",
} as const;

export type LoginStringKey = keyof typeof LOGIN_STRINGS;

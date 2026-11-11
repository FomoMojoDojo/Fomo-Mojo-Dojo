// S-U6-7 … S-U6-9 parity. A signed string is only signed while something checks it, and the thing
// most likely to drift is the one a developer edits to make a layout look right.
//
// The second half matters as much as the first: the OLD admin-flavoured copy must be gone from the
// page. U6-55 sends every signed-out visitor to /login, members included, so "Admin Login" and "CMS
// Access" appearing anywhere in that component is the regression this test exists to catch.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LOGIN_STRINGS } from "./loginStrings";

const LOGIN_TSX = join(__dirname, "Login.tsx");

describe("login page strings (S-U6-7 … S-U6-9)", () => {
  it("are verbatim as signed", () => {
    expect(LOGIN_STRINGS.heading).toBe("Sign in to MojoMap™");
    expect(LOGIN_STRINGS.subheading).toBe("Enter your email and password");
    expect(LOGIN_STRINGS.previewMode).toBe(
      "Preview mode: Supabase credentials are not configured, so sign-in is local-only.",
    );
  });

  it("the page renders them from this file, not from its own literals", () => {
    const src = readFileSync(LOGIN_TSX, "utf8");
    expect(src).toContain("LOGIN_STRINGS");
    for (const key of ["heading", "subheading", "previewMode"] as const) {
      expect(src, `Login.tsx does not render LOGIN_STRINGS.${key}`).toContain(`LOGIN_STRINGS.${key}`);
    }
  });

  it("the admin-flavoured copy is gone from the page", () => {
    const src = readFileSync(LOGIN_TSX, "utf8");
    for (const gone of ["Admin Login", "CMS Access", "admin access is local-only"]) {
      expect(src, `Login.tsx still carries the pre-U6-55 copy ${JSON.stringify(gone)}`).not.toContain(gone);
    }
  });
});

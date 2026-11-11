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
    expect(LOGIN_STRINGS.wordmark).toBe("MojoMap\u2122"); // U6-59
    expect(LOGIN_STRINGS.heading).toBe("Sign in to MojoMap™");
    expect(LOGIN_STRINGS.subheading).toBe("Enter your email and password");
    expect(LOGIN_STRINGS.previewMode).toBe(
      "Preview mode: Supabase credentials are not configured, so sign-in is local-only.",
    );
  });

  it("the page renders them from this file, not from its own literals", () => {
    const src = readFileSync(LOGIN_TSX, "utf8");
    expect(src).toContain("LOGIN_STRINGS");
    for (const key of ["wordmark", "heading", "subheading", "previewMode"] as const) {
      expect(src, `Login.tsx does not render LOGIN_STRINGS.${key}`).toContain(`LOGIN_STRINGS.${key}`);
    }
  });

  it("the admin-flavoured copy is gone from the page", () => {
    const src = readFileSync(LOGIN_TSX, "utf8");
    for (const gone of ["Admin Login", "CMS Access", "admin access is local-only"]) {
      expect(src, `Login.tsx still carries the pre-U6-55 copy ${JSON.stringify(gone)}`).not.toContain(gone);
    }
  });

  // U6-59 and U6-58 (2026-11-11). Two removals, both of which say something to a client about what
  // this product is: the unmarked wordmark and the line describing an internal tool, and the
  // invitation to create an account that no longer exists.
  it("U6-59: the unmarked wordmark and the internal-review line are gone", () => {
    const src = readFileSync(LOGIN_TSX, "utf8");
    expect(src, "the page still renders the unmarked 'MOJO MAP' wordmark").not.toMatch(/>\s*MOJO MAP\s*</);
    expect(src, "the 'internal review' description is still on a client-facing page")
      .not.toContain("Strategy workspace access for company research");
  });

  it("U6-58: no sign-up control, and no sign-up mode, remain on the page", () => {
    const src = readFileSync(LOGIN_TSX, "utf8");
    // CODE SHAPES, not bare words. The comments in Login.tsx name what was removed and why — the
    // first version of this assertion failed on its own explanation, which is the same mistake
    // noHardcodedCompany.test.ts documents at length.
    expect(src, "the mode union still admits a sign-up mode")
      .toMatch(/useState<'login' \| 'forgot'>\('login'\)/);
    expect(src, "a sign-up branch is still reachable").not.toMatch(/mode\s*===\s*'signup'/);
    expect(src, "a control still switches the form into sign-up").not.toMatch(/setMode\(\s*'signup'/);
    expect(src, "the page still calls signUp").not.toMatch(/\bsignUp\s*\(/);
    expect(src, "the page still destructures signUp from useAuth").not.toMatch(/\{[^}]*\bsignUp\b[^}]*\}\s*=\s*useAuth\(\)/);
    // Forgot password STAYS: it is a door for an account that already exists.
    expect(src, "Forgot password was removed — it is not an account-creation control").toContain("Forgot password?");
  });

  it("U6-58: the auth context no longer exposes signUp at all", () => {
    const auth = readFileSync(join(__dirname, "..", "hooks", "useAuth.tsx"), "utf8");
    expect(auth, "useAuth still declares a signUp in its context type").not.toMatch(/^\s*signUp:/m);
    expect(auth, "useAuth still calls supabase.auth.signUp").not.toContain("auth.signUp(");
  });
});

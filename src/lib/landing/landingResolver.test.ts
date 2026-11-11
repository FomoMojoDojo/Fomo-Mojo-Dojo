// The landing decision, in one place and without a browser (U6 part 1, 2026-11-11).
//
// U6-63: the last case in the first block is the one that carries what
// frontDoorRouting.test.tsx:46 used to assert. That line checked that signing in sent an operator to
// the Front Door; signing in now goes to /start, so the OUTCOME it was protecting is asserted here
// instead — an admin at /start resolves to CLIENT_REFINE_PREVIEW_ROUTE.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  POST_SIGN_IN_ROUTE,
  companyIdFromPath,
  isMemberLandingPath,
  resolveLanding,
  type LandingCompany,
} from "./landingResolver";
import { CLIENT_REFINE_PREVIEW_ROUTE } from "@/lib/clientRefinePreview";

const OWN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const NEWER = "cccccccc-cccc-4ccc-8ccc-ccccccccccc3";

const co = (id: string, name = "Org"): LandingCompany => ({ id, name });
const none = new Set<string>();

// Default: a member who holds nothing. Each test supplies only what it is about. `firstReadReady`
// defaults to "every company passed in has a First Read", because that is the ordinary state — the
// not_ready block below is what overrides it to empty.
function resolve(over: Partial<Parameters<typeof resolveLanding>[0]> = {}) {
  const companies = over.companies ?? [];
  return resolveLanding({
    isAdmin: false,
    diagnoseRunning: none,
    firstReadReady: new Set(companies.map((c) => c.id)),
    carriedNext: null,
    ...over,
    companies,
  });
}

describe("the admin's destination is unchanged", () => {
  it("no carry → the Front Door (what frontDoorRouting:46 asserted before /start)", () => {
    expect(resolve({ isAdmin: true })).toEqual({ kind: "admin_home", path: CLIENT_REFINE_PREVIEW_ROUTE });
    expect(CLIENT_REFINE_PREVIEW_ROUTE).toBe("/preview/client-refine");
  });

  it("an admin's deep link is honoured whatever company it names — admins hold none", () => {
    const path = `/preview/client-refine/first-read/${OTHER}`;
    expect(resolve({ isAdmin: true, carriedNext: path })).toEqual({ kind: "deep_link", path });
  });

  it("an admin with no membership rows still gets the Front Door, never S-U6-1", () => {
    expect(resolve({ isAdmin: true, companies: [] }).kind).toBe("admin_home");
  });
});

describe("a member lands on their own company", () => {
  it("one company, nothing running → its First Read", () => {
    expect(resolve({ companies: [co(OWN)] })).toEqual({
      kind: "first_read",
      path: `/preview/client-refine/first-read/${OWN}`,
      companyId: OWN,
    });
  });

  it("one company with Diagnose running → the Diagnose home (MH1), not the First Read", () => {
    expect(resolve({ companies: [co(OWN)], diagnoseRunning: new Set([OWN]) })).toEqual({
      kind: "diagnose",
      path: `/preview/client-refine/diagnose/${OWN}/home`,
      companyId: OWN,
    });
  });

  it("SEVERAL companies → the most recently assigned, which is companies[0] (U6-49)", () => {
    // The caller orders by company_members.created_at desc; the resolver does not re-sort.
    const r = resolve({ companies: [co(NEWER), co(OWN), co(OTHER)] });
    expect(r).toMatchObject({ kind: "first_read", companyId: NEWER });
  });

  it("several companies, Diagnose running on an OLDER one → still the newest, and its First Read", () => {
    const r = resolve({ companies: [co(NEWER), co(OWN)], diagnoseRunning: new Set([OWN]) });
    expect(r).toMatchObject({ kind: "first_read", companyId: NEWER });
  });

  it("no company at all → S-U6-1, and no path to send them to", () => {
    expect(resolve({ companies: [] })).toEqual({ kind: "no_company" });
  });

  it("their own company with NOTHING open → S-U6-6, not an empty First Read", () => {
    expect(resolve({ companies: [co(OWN, "Edgewood")], firstReadReady: none })).toEqual({
      kind: "not_ready",
      companyId: OWN,
      organization: "Edgewood",
    });
  });

  it("nothing open but Diagnose running → the Diagnose home wins over S-U6-6", () => {
    expect(resolve({ companies: [co(OWN)], firstReadReady: none, diagnoseRunning: new Set([OWN]) }))
      .toMatchObject({ kind: "diagnose", companyId: OWN });
  });
});

describe("a member's deep link is honoured only for a company they hold", () => {
  it("their own company's First Read → honoured verbatim, query string and all", () => {
    const path = `/preview/client-refine/first-read/${OWN}?mark=beat%7Cx`;
    expect(resolve({ companies: [co(OWN)], carriedNext: path })).toEqual({ kind: "deep_link", path });
  });

  it("their own company's Diagnose walk → honoured", () => {
    const path = `/preview/client-refine/diagnose/${OWN}/w2`;
    expect(resolve({ companies: [co(OWN)], carriedNext: path })).toEqual({ kind: "deep_link", path });
  });

  it("ANOTHER company's page → their own landing, not the refusal and not the link", () => {
    const r = resolve({ companies: [co(OWN)], carriedNext: `/preview/client-refine/first-read/${OTHER}` });
    expect(r).toMatchObject({ kind: "first_read", companyId: OWN });
  });

  it("a path that names NO company → their own landing (the Front Door is not a member's page)", () => {
    for (const path of [CLIENT_REFINE_PREVIEW_ROUTE, "/legacy/map", "/preview/client-refine/workspace"]) {
      expect(resolve({ companies: [co(OWN)], carriedNext: path })).toMatchObject({ kind: "first_read", companyId: OWN });
    }
  });

  it("a deep link with no membership anywhere is still S-U6-1 — the carry cannot create access", () => {
    expect(resolve({ companies: [], carriedNext: `/preview/client-refine/first-read/${OTHER}` })).toEqual({ kind: "no_company" });
  });
});

describe("companyIdFromPath reads only the three families that name a company", () => {
  it("reads the id from first-read, diagnose and company paths", () => {
    expect(companyIdFromPath(`/preview/client-refine/first-read/${OWN}`)).toBe(OWN);
    expect(companyIdFromPath(`/preview/client-refine/diagnose/${OWN}/home`)).toBe(OWN);
    expect(companyIdFromPath(`/preview/client-refine/company/${OWN}`)).toBe(OWN);
    expect(companyIdFromPath(`/preview/client-refine/first-read/${OWN}?mark=a%7Cb#x`)).toBe(OWN);
  });

  it("returns null for a path that names none, and for a segment that is not a uuid", () => {
    for (const p of [
      CLIENT_REFINE_PREVIEW_ROUTE,
      "/preview/client-refine/workspace/inputs",
      "/preview/client-refine/first-read",
      "/preview/client-refine/first-read/not-a-uuid",
      "/legacy/map",
      "",
      null,
      undefined,
      "https://evil.test/preview/client-refine/first-read/" + OWN,
    ]) expect(companyIdFromPath(p as string)).toBeNull();
  });
});

describe("the route constant", () => {
  it("is /start", () => expect(POST_SIGN_IN_ROUTE).toBe("/start"));
});

// WHAT THIS PREDICATE IS FOR NOW (corrected 2026-11-11). It was written because ClientModePathSync
// bounces every path to "/" in client mode, and a non-admin is always client presentation — so a
// member whose landing was not exempt would be bounced to "/", which sends them to /start, which
// resolves back to the landing: an infinite redirect.
//
// The sync is now ADMIN-ONLY, so that is no longer what saves a member — the isAdmin test is. What
// the exemption still does is let an ADMIN in client presentation stay on the two families a client
// can reach, instead of being bounced off the screens they are reviewing. The measured difference
// from 3af07eb1 is written out at the call site in App.tsx.
describe("isMemberLandingPath — the two families ClientModePathSync exempts", () => {
  it("covers /start and both company families", () => {
    expect(isMemberLandingPath("/start")).toBe(true);
    expect(isMemberLandingPath(`/preview/client-refine/first-read/${OWN}`)).toBe(true);
    expect(isMemberLandingPath(`/preview/client-refine/diagnose/${OWN}/home`)).toBe(true);
    expect(isMemberLandingPath(`/preview/client-refine/diagnose/${OWN}/w2`)).toBe(true);
  });

  it("is NARROWER than isClientRefinePreviewPath — an operator's surfaces stay bounced", () => {
    for (const p of [
      CLIENT_REFINE_PREVIEW_ROUTE,
      "/preview/client-refine/workshop",
      "/preview/client-refine/workspace/inputs",
      "/preview/client-refine/inbox",
      "/preview/client-refine/members",
      `/preview/client-refine/company/${OWN}`,
      "/legacy/map",
      "/",
    ]) expect(isMemberLandingPath(p), `${p} should not be exempt`).toBe(false);
    expect(isMemberLandingPath(null)).toBe(false);
  });

  it("App.tsx actually consults it, for non-admins only", () => {
    const app = readFileSync(join(__dirname, "..", "..", "App.tsx"), "utf8");
    expect(app, "ClientModePathSync no longer calls isMemberLandingPath — if the call is gone, this predicate and these tests should go with it").toContain("isMemberLandingPath(location.pathname)");
    // and the sync itself applies to admins only — it is a global effect, so for a forced-client
    // non-admin it would outrank every route guard, including the role refusal U6-56 requires.
    const sync = app.slice(app.indexOf("function ClientModePathSync()"));
    expect(sync.slice(0, sync.indexOf("\n}")), "ClientModePathSync is not scoped to admins").toContain("if (!isAdmin) return;");
  });
});

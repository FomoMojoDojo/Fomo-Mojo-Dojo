// No-public-site onramp (2026-09-16) — the Add-Client dialog's contract, as a source guard on
// ClientRefinePreviewWorkshopView.handleCreateClient (the view is not unit-renderable; the behaviour
// is proven live in tests/workspace/t-no-public-site.spec.ts). With the box checked: the row insert
// carries no_public_site:true and website:null; no research-company / public-baseline path runs — the
// ONLY invoke is run-agent-flow with website "" (which skips before the guard and ledgers the skip);
// the toast is the signed state line. The strings are byte-identical to the register.
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { WORKSPACE_STRINGS } from "@/views/client/workspace/workspaceNav";

const ROOT = path.resolve(__dirname, "../../..");
const src = fs.readFileSync(path.join(ROOT, "src/views/client/ClientRefinePreviewWorkshopView.tsx"), "utf8");
const fn = src.slice(src.indexOf("const handleCreateClient = useCallback"), src.indexOf("setCreatingClient(false);\n    }\n  }, ["));

describe("Add-Client: no public site", () => {
  it("strings (draft pending signature): checkbox label + state line", () => {
    expect(WORKSPACE_STRINGS.noPublicSiteLabel).toBe("No public site");
    expect(WORKSPACE_STRINGS.noPublicSiteState).toBe("No public site — nothing is crawled or searched for this company.");
  });
  it("the checkbox carries the operator mark and clears + disables the website input", () => {
    expect(src).toMatch(/data-fr-operator="no-public-site"/);
    expect(src).toMatch(/disabled=\{newClientNoPublicSite\}/);
    expect(src).toMatch(/if \(event\.target\.checked\) setNewClientWebsite\(""\)/);
  });
  it("flagged: website is '' before sanitising, the insert carries no_public_site and website null", () => {
    expect(fn).toMatch(/const sanitizedWebsite = noPublicSite \? "" : sanitizeWebsite\(newClientWebsite\)/);
    expect(fn).toMatch(/website: sanitizedWebsite \|\| null,\s*\n\s*no_public_site: noPublicSite,/);
  });
  it("flagged: the only invoke is run-agent-flow with website '' (skip + ledger); no baseline, no onramp birth", () => {
    const flagged = fn.slice(fn.indexOf("if (noPublicSite) {"), fn.indexOf("} else if (newClientRunBaseline && sanitizedWebsite) {"));
    expect(flagged).toMatch(/invoke\("run-agent-flow", \{\s*\n\s*body: coldStartBody\(data\.id, data\.name, "", "add_client_create_no_public_site"\)/);
    const code = flagged.replace(/\/\/[^\n]*/g, ""); // prose may name the laws; code may not call them
    expect(code).not.toMatch(/runCreateOnramp|invoke\("public-baseline"|invoke\("research-company"|coldStartBody\([^)]*sanitizedWebsite/);
    expect(flagged).toMatch(/toast\.success\(`\$\{data\.name\}: \$\{WORKSPACE_STRINGS\.noPublicSiteState\}`\)/);
  });
  it("the birth+baseline onramp is reachable only when NOT flagged", () => {
    expect(fn).toMatch(/\} else if \(newClientRunBaseline && sanitizedWebsite\) \{/);
  });
});

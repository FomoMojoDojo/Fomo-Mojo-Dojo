// Home reskin (2026-09-11) — OPERATOR-DEFAULT + SIDEBAR VARIANT guards.
//
// (b) On the default render of /preview/client-refine/home no operator affordance is in the DOM —
//     "Scan all surfaces", "INTERACTION SPEC", the keyboard legend ("MAIN SITE"), "Client View →", the
//     collapse glyph, the ⚙ workbench FAB, and the per-company "score n" switcher — and all of them
//     appear when the First Read operator switch is on. ClientRefinePreviewView (4.7k lines of live
//     hooks) is not renderable in vitest, so the view is guarded at the SOURCE in the repo's idiom
//     (gate3Exclusion.test.ts / frontDoorRouting.test.ts), and the two components that carry the
//     behaviour are exercised for real: WorkshopSidebar variant="fr" under the OperatorControlsContext,
//     and the shell Header with no beats. The live DOM check on the running app is in the gate report.
// (e) The default WorkshopSidebar variant is byte-identical to its pre-reskin DOM.
//
// RED ON REVERT: the source guards fail on the pre-reskin view; the fr variant does not exist.
import { describe, it, expect, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useNavigate: () => vi.fn(),
}));
vi.mock("@/hooks/useSurfaceTeachingMode", () => ({ useSurfaceTeachingMode: () => ({ enabled: false, toggle: vi.fn() }) }));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({ activeCompany: { id: "co-1", name: "Gotham Sports" } }) }));

import { WorkshopSidebar } from "@/components/client/WorkshopSidebar";
import { OperatorControlsContext } from "@/views/client/firstReadPreview/operatorControls";
import { Header } from "@/views/client/firstReadPreview/shell";
import { HeaderCompanySwitcher } from "@/views/client/home/HeaderCompanySwitcher";

const ROOT = path.resolve(__dirname, "../../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const noop = () => {};

describe("(b) home default render carries no operator affordance — source guards on ClientRefinePreviewView", () => {
  const src = read("src/views/client/ClientRefinePreviewView.tsx");

  it("the hasHierarchy branch is a .first-read root with the shell Header, the fr sidebar and HomepageHierarchyFR", () => {
    expect(src).toMatch(/<div className="first-read fr-home-page" data-testid="home-fr-root"/);
    expect(src).toMatch(/<Header\s+title="MojoMap"/);
    expect(src).toMatch(/<WorkshopSidebar\s+variant="fr"/);
    expect(src).toMatch(/<HomepageHierarchyFR/);
    expect(src).not.toMatch(/<HomepageHierarchy\s/);        // the CRPV body no longer mounts
  });

  it("Scan all surfaces (+ status line) renders only while the operator switch is on", () => {
    const i = src.indexOf('{homeOperatorOn ? (');
    const j = src.indexOf('"Scan all surfaces"');
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);                              // the Scan block sits inside the gate
    expect(src.slice(i, j)).not.toMatch(/\) : null\}/);         // …and the gate has not closed before it
  });

  it("the identity string is rendered in both states; with the switch on the switcher ATTACHES to it and Scan sits in the Header's right slot", () => {
    expect(src).toMatch(/const identityNode = <span className="cap">\[\{toSentence\(activeCompany\?\.name\) \|\| "COMPANY"\}\] · DAY \{ENGAGEMENT_DAY \?\? "—"\}/);
    expect(src).toMatch(/homeOperatorOn && companies\.length > 1 \? \(\s*<HeaderCompanySwitcher\s+identity=\{identityNode\}/);
    expect(src).toMatch(/\) : identityNode;/);
    expect(src).toMatch(/right=\{homeOperatorOn \? \([\s\S]{0,1500}"Scan all surfaces"/);
  });

  it("INTERACTION SPEC, the keyboard legend and the ⚙ FAB are gated (!hasHierarchy || homeOperatorOn)", () => {
    const gates = src.match(/\{\(!hasHierarchy \|\| homeOperatorOn\) && \(/g) ?? [];
    expect(gates).toHaveLength(3);
    for (const marker of ['"▸ INTERACTION SPEC"', 'className="crpv-legend"', "crpv-tweaks-fab"]) {
      const at = src.indexOf(marker);
      const gate = src.lastIndexOf("{(!hasHierarchy || homeOperatorOn) && (", at);
      expect(gate, `${marker} is not gated`).toBeGreaterThan(-1);
      expect(at - gate).toBeLessThan(400);
    }
  });

  it("the operator switch is state-only (never persisted) and toggles the context", () => {
    expect(src).toMatch(/const \[homeOperatorOn, setHomeOperatorOn\] = useState\(false\)/);
    expect(src).toMatch(/homeOperatorOn \? \{ decide: async \(\) => \{\} \} : null/);
    expect(src).toMatch(/data-fr-operator-switch=\{homeOperatorOn \? "on" : "off"\}/);
    expect(src).not.toMatch(/localStorage[^\n]*homeOperator/);
  });

  it("the !hasHierarchy branch and the Tweaks aside are untouched: their markers are still present verbatim", () => {
    for (const marker of [
      '<div className="crpv-command-main">',
      '{!hasHierarchy && <OperatingModeBar mode={operatingMode} onChange={setOperatingMode} descriptorOverride={enforcement.safeModeDescriptor} />}',
      '<aside className={`crpv-tweaks ${tweaksOpen ? "open" : ""}`}>',
      '<span>{isAdmin ? "Admin Workbench" : "Tweaks · Drawer Access"}</span>',
    ]) expect(src).toContain(marker);
  });
});

describe("(b) WorkshopSidebar variant=\"fr\" — operator chrome follows the First Read switch", () => {
  const full = (variant: "fr" | "default", operator: boolean) => render(
    <MemoryRouter>
      <OperatorControlsContext.Provider value={operator ? { decide: async () => {} } : null}>
        <WorkshopSidebar variant={variant} activeTab={null} onTabClick={noop} onHome={noop} onCompany={noop} onMembers={noop} onExtracts={noop} onInbox={noop} isHome />
      </OperatorControlsContext.Provider>
    </MemoryRouter>,
  );

  it("switch OFF: no 'Client View', no collapse glyph; every client destination present", () => {
    const { container, queryByText, getByText } = full("fr", false);
    expect(queryByText("Client View →")).toBeNull();
    expect(container.querySelector(".fr-nav-toggle")).toBeNull();
    expect(container.querySelector(".fr-nav")).toBeTruthy();
    expect(container.querySelector("[data-variant='fr']")).toBeTruthy();
    for (const label of ["All companies", "Diagnose", "Routes", "Council", "Opportunities", "Strategy", "Positioning", "Job Map", "Inputs", "First read", "Inbox", "Company", "Member roles", "Extracts"]) {
      expect(getByText(label)).toBeTruthy();
    }
    expect(container.innerHTML).not.toMatch(/crpv-/);      // the class swap is complete
  });

  it("switch ON: 'Client View →' and the collapse glyph appear", () => {
    const { container, getByText } = full("fr", true);
    expect(getByText("Client View →")).toBeTruthy();
    expect(container.querySelector(".fr-nav-toggle")).toBeTruthy();
  });

  it("(e) the default variant is unchanged: CRPV classes, chrome always drawn, no fr-nav-*, no data-variant", () => {
    const { container, getByText } = full("default", false);
    expect(container.querySelector(".crpv-ws-tabs.crpv-hier-rail")).toBeTruthy();
    expect(container.querySelector(".crpv-sidebar-toggle")).toBeTruthy();
    expect(getByText("Client View →")).toBeTruthy();
    expect(container.innerHTML).not.toMatch(/fr-nav/);
    expect(container.querySelector("[data-variant]")).toBeNull();
    expect(container.innerHTML).toMatchSnapshot();
  });
});

describe("(b) shell Header with the switch ON: MojoMap + the identity string + the switcher, and Scan in the right slot", () => {
  const IDENTITY = "[GOTHAM SPORTS] · DAY — · OUTSIDE SIGNALS";
  const companies = [{ id: "a", name: "Gotham Sports" }, { id: "b", name: "Coreviva" }] as never[];
  const switcher = (
    <HeaderCompanySwitcher
      identity={<span className="cap">{IDENTITY}</span>}
      showHeaderSwitcher={false} setShowHeaderSwitcher={() => {}} headerSwitcherRef={{ current: null }}
      activeCompany={{ id: "a", name: "Gotham Sports" } as never} companies={companies} setActiveCompanyId={() => {}}
      ENGAGEMENT_DAY={null} dominantClaimState={null} phase="outside"
    />
  );
  it("switch ON: identical title + identity text, plus the switcher trigger and the Scan slot", () => {
    const { container, getByText } = render(<Header title="MojoMap" identity={switcher} right={<button type="button">Scan all surfaces</button>} />);
    expect(getByText("MojoMap")).toBeTruthy();
    expect(container.querySelector(".fr-shell-identity")?.textContent).toContain(IDENTITY);   // byte-identical string, inside the trigger
    expect(container.querySelector(".crpv-co-switcher")).toBeTruthy();
    expect(container.querySelector(".crpv-co-trigger .crpv-co-caret")?.textContent).toBe("▼");
    expect(container.textContent).not.toMatch(/·\s*·/);                                       // no doubled separator: the switcher's own "· DAY" span is not drawn
    expect(getByText("Scan all surfaces")).toBeTruthy();
  });
  it("switch OFF: the same Header with the plain identity is text-identical apart from the caret and the Scan button", () => {
    const on = render(<Header title="MojoMap" identity={switcher} right={<button type="button">Scan all surfaces</button>} />).container.textContent ?? "";
    const off = render(<Header title="MojoMap" identity={<span className="cap">{IDENTITY}</span>} right={null} />).container.textContent ?? "";
    expect(on.replace("▼", "").replace("Scan all surfaces", "")).toBe(off);
  });
});

describe("(d) shell Header without beats", () => {
  it("renders title + identity and the right slot; no progress ticks", () => {
    const { container, getByText } = render(<Header title="MojoMap" identity={<span>[GOTHAM SPORTS] · DAY — · OUTSIDE SIGNALS</span>} right={<span data-testid="r">R</span>} />);
    expect(getByText("MojoMap")).toBeTruthy();
    expect(getByText("[GOTHAM SPORTS] · DAY — · OUTSIDE SIGNALS")).toBeTruthy();
    expect(container.querySelector('[data-testid="r"]')).toBeTruthy();
    expect(container.querySelector(".fr-progress-tick")).toBeNull();
  });
});

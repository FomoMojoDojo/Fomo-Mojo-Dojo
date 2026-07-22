// RG-1 HOTFIX REGRESSION — MarketAct must MOUNT without a ReferenceError.
//
// RG-1's routing commit added a useMemo call to MarketAct but no react import,
// and it shipped: `vite build` is esbuild (no type-check), and the root
// tsconfig has files:[] so `tsc --noEmit` checked nothing. The client view
// crashed at runtime with "useMemo is not defined". No test loaded this
// component, so nothing caught it.
//
// This is that missing coverage: a mount smoke for the component. It exercises
// BOTH branches (options present / absent) — the crash was in the body, before
// either branch. Verified to fail with the exact ReferenceError when the import
// is removed, so it is not a vacuous pass.
import { render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({ activeCompany: { id: "c1" } }) }));
vi.mock("@/hooks/useMarketPortfolio", () => ({
  useMarketPortfolio: () => ({ loading: false, portfolio: { active: [], deferred: [] }, hasInternalDeclared: false }),
}));

import MarketAct from "@/components/client-view/story/movement/MarketAct";
import * as opts from "@/hooks/useMarketOptions";

describe("MarketAct mounts without a hook ReferenceError (RG-1 hotfix regression)", () => {
  it("renders the options branch", () => {
    vi.spyOn(opts, "useMarketOptions").mockReturnValue({
      loading: false,
      options: [{
        id: "o1", executor_statement: "Funders", job_statement: "Advance well-being",
        basis: null, relationship_kind: "funder", market_register: "public_inferred",
      }],
    } as never);
    expect(() => render(<MarketAct />)).not.toThrow();
  });

  it("renders the empty/blended branch", () => {
    vi.spyOn(opts, "useMarketOptions").mockReturnValue({ loading: false, options: [] } as never);
    expect(() => render(<MarketAct />)).not.toThrow();
  });
});

// L2 (2026-11-17) — "Re-run analysis" is rendered NOWHERE. The operator found a control with that label
// that started no run. Every control that STARTS a file analysis reads the signed "Analyze again" and
// calls runDifyAnalyzeFile; a control that only refetches the read reads the existing "Refresh read".
//
// (a) the source scan: no .ts/.tsx under src/ (tests excepted) carries the label, in any casing or with
//     the hyphen dropped. A scan, because a render test can only see the components it mounts.
// (b) ClientModeNav — mounted on five client views — renders "Refresh read" and calls the refetch it is given.
import { describe, it, expect, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { render, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ClientModeNav from "@/components/client-view/ClientModeNav";

const FORBIDDEN = /\bre-?run(?:ning)?\s+(?:the\s+)?analysis\b/i;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    if (!/\.(ts|tsx)$/.test(name) || /\.(test|spec)\.(ts|tsx)$/.test(name)) return [];
    return [p];
  });
}

describe("L2 — no control is labelled \"Re-run analysis\"", () => {
  it("(a) no source file under src/ carries the label", () => {
    const hits = sourceFiles(join(process.cwd(), "src")).flatMap((file) =>
      readFileSync(file, "utf8").split("\n").flatMap((line, i) => (FORBIDDEN.test(line) ? [`${file}:${i + 1}: ${line.trim()}`] : [])),
    );
    expect(hits).toEqual([]);
  });

  it("(a) the scan itself goes red on the label (non-vacuous)", () => {
    expect(FORBIDDEN.test('{rerunning ? "Re-running..." : "Re-run analysis"}')).toBe(true);
    expect(FORBIDDEN.test("Re-run analysis →")).toBe(true);
    expect(FORBIDDEN.test("rerun analysis")).toBe(true);
    expect(FORBIDDEN.test("Analyze again")).toBe(false);
  });

  it("(b) ClientModeNav renders \"Refresh read\" and calls the refetch it is given", () => {
    const onRerunAnalysis = vi.fn();
    const { container } = render(
      <MemoryRouter>
        <ClientModeNav activeMode="foundation" mapStatus="signal" onRerunAnalysis={onRerunAnalysis} />
      </MemoryRouter>,
    );
    expect(container.textContent).not.toMatch(FORBIDDEN);
    const btn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Refresh read");
    expect(btn).toBeTruthy();
    fireEvent.click(btn!);
    expect(onRerunAnalysis).toHaveBeenCalledTimes(1);
  });
});

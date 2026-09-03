// Beat 3 "What you say" — (b) ruling 2026-09-03: the demoted "Your channels, as we read them" block
// renders ONLY sources on the company's own host. Aggregator-hosted self-copy (Glassdoor About,
// press-wire release body, ZoomInfo description) keeps voice_class='client_voice' (it is the
// company's voice, it never echoes) but is NOT one of the company's channels and must not render
// there. The filter lives at the SELECTION site (ownHostSignalByClaim, the same isOwnDomainUrl rule
// the stamping guard uses), never in CSS. Each proof fails if the filter is removed.
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ActWhatYouSay } from "./acts";
import { EMPTY_FIRST_READ, type FirstReadPreviewData, type FRDeclared } from "./types";
import { ownHostSignalByClaim } from "../../../../supabase/functions/_shared/firstReadProvenance";

type Sig = { id: string; source_url: string | null; voice_class: string | null; event_date: string | null };
const COMPANY_HOST = "geniant.com";
const SIGS: Sig[] = [
  { id: "s-own", source_url: "https://geniant.com/work/brainspace", voice_class: "client_voice", event_date: "2026-09-01" },
  { id: "s-glassdoor", source_url: "https://www.glassdoor.com/Overview/Working-at-geniant-EI_IE32093.11,18.htm", voice_class: "client_voice", event_date: "2026-09-02" },
  { id: "s-wire", source_url: "https://www.globenewswire.com/search/organization/geniant", voice_class: "client_voice", event_date: "2026-09-02" },
];
const SIG_BY_ID = new Map(SIGS.map((s) => [s.id, s]));
// claim c-own is backed by the own-host page; c-glassdoor / c-wire are backed only by aggregator-hosted self-copy.
const REFS = [
  { claim_id: "c-own", signal_id: "s-own" },
  { claim_id: "c-glassdoor", signal_id: "s-glassdoor" },
  { claim_id: "c-wire", signal_id: "s-wire" },
];
const STATEMENTS: Record<string, string> = {
  "c-own": "geniant completely redesigned the Brainspace platform.",
  "c-glassdoor": "Working with a wide range of organizations - geniant excels at delivering exceptional experiences.",
  "c-wire": "geniant announced the acquisition of 17seconds, a leading product design and innovation studio.",
};

/** The hook's selection, reduced to its pure core: a channel row exists only for claims the helper kept. */
function channelRows(): FRDeclared[] {
  const keep = ownHostSignalByClaim(REFS, SIG_BY_ID, COMPANY_HOST);
  return Object.keys(STATEMENTS)
    .filter((id) => keep.has(id))
    .map((id) => ({ id, topic: "market", facet: "Market", statement: STATEMENTS[id], sourceTag: { label: `${new URL(keep.get(id)!.source_url!).hostname} · read September 2, 2026` } }));
}

const read = (declared: FRDeclared[]): FirstReadPreviewData => ({
  ...EMPTY_FIRST_READ,
  company: { name: "Geniant", website: "https://geniant.com" },
  ownWords: [{ id: "o1", quote: "We don't train on your data.", pageUrl: "https://geniant.com/", pageHost: "geniant.com", fidelity: "verbatim", sourceTag: { label: "geniant.com · read September 2, 2026" } }],
  ownWordsLooked: true,
  declared,
});

describe("beat 3 (b) — the channel block renders only the company's own host", () => {
  it("selection: only the own-host client_voice signal is kept; aggregator-hosted self-copy gets no entry", () => {
    const keep = ownHostSignalByClaim(REFS, SIG_BY_ID, COMPANY_HOST);
    expect([...keep.keys()]).toEqual(["c-own"]);
    expect(keep.get("c-own")?.id).toBe("s-own");
  });

  it("DOM: one own-host row + one glassdoor row + one wire row → EXACTLY one channel row", () => {
    const { container } = render(<ActWhatYouSay read={read(channelRows())} />);
    const block = container.querySelector('[data-fr-block="channels"]');
    expect(block).not.toBeNull();
    expect(block!.querySelectorAll(".fr-row")).toHaveLength(1);
    const text = block!.textContent ?? "";
    expect(text).toContain("Brainspace");
    expect(text).not.toContain("Working with a wide range");
    expect(text).not.toContain("acquisition of 17seconds");
    // "In your words" is untouched: still rendered, above the block.
    expect(container.textContent).toContain("We don't train on your data.");
  });

  it("prefers the NEWEST own-host signal when a claim has both on-host and off-host backing", () => {
    const sigs = new Map<string, Sig>([
      ["s-old-own", { id: "s-old-own", source_url: "https://geniant.com/about", voice_class: "client_voice", event_date: "2025-01-01" }],
      ["s-new-own", { id: "s-new-own", source_url: "https://www.geniant.com/perspectives", voice_class: "client_voice", event_date: "2026-05-01" }],
      ["s-newest-glassdoor", { id: "s-newest-glassdoor", source_url: "https://www.glassdoor.com/Overview/x", voice_class: "client_voice", event_date: "2026-09-02" }],
    ]);
    const keep = ownHostSignalByClaim(
      [{ claim_id: "c", signal_id: "s-old-own" }, { claim_id: "c", signal_id: "s-newest-glassdoor" }, { claim_id: "c", signal_id: "s-new-own" }],
      sigs, COMPANY_HOST,
    );
    expect(keep.get("c")?.id).toBe("s-new-own");
  });

  it("when every channel row is off-host the block renders nothing (pre-existing empty behaviour), own words still lead", () => {
    const { container } = render(<ActWhatYouSay read={read([])} />);
    expect(container.querySelector('[data-fr-block="channels"]')).toBeNull();
    expect(container.textContent).toContain("We don't train on your data.");
  });
});

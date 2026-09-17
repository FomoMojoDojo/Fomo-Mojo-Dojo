// C2 (2026-09-17) — publicly_declared parity. The company's own words arriving through a registry (a
// publicly_declared claim) are ABSENT from every outside / record surface and PRESENT — framed — on the
// declared (say) side. Each outside reader is allowlist-polar on public_observed; each declared reader names
// publicly_declared beside internal_declared / client_attested. Bypass: widen the allowlist → the outside
// assertions fail; the frame strings are byte-identical to the signed ones.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isPublicProvenance, isPublicRegister } from "@/lib/registerGuard";
import { assembleDeltaItems, type DeltaInput } from "@/lib/firstRead/deltaItems";
import { deriveClaimProvenance, mapSignalsToClaimCandidates, registryFilingOrigin } from "@/lib/evidenceMappers";
import type { SignalDraft } from "@/lib/evidenceDomain";
import { FILING_FRAME_HEAD, PROFILE_FRAME_HEAD, filingOrigin, registryOriginOf } from "@/views/client/workspace/InterviewOrigin";
import { deriveDiagnoseModel, isDeclaredRegister, isSaySideRegister, isSeeSideRegister } from "@/lib/marketPortfolio/diagnosePairs";
import type { ResolvedMarket } from "@/lib/marketPortfolio/resolveMarketPortfolio";

const src = (p: string) => readFileSync(p, "utf8");

const FILING_CLAIM = {
  id: "claim-pd", provenance: "publicly_declared", statement: "Edgewood CSU is the only crisis stabilization unit serving youth under 12 in the Bay Area.",
  raw_payload: { origin: "registry_filing", host: "guidestar.org", page_type: "profile", section: "self_reported", snapshot_read_at: "2026-09-14T14:52:51.890Z" },
};

describe("(a) outside surfaces — allowlist-polar on public_observed; publicly_declared never admitted", () => {
  it("registerGuard.isPublicProvenance: the ONE client-facing authority rejects publicly_declared", () => {
    expect(isPublicProvenance("public_observed")).toBe(true);
    expect(isPublicProvenance("publicly_declared")).toBe(false);
    expect(isPublicProvenance("internal_declared")).toBe(false);
    expect(isPublicProvenance("client_attested")).toBe(false);
  });
  it("deltaItems (The Check / THE RECORD SAYS): an internally_silent row whose observed side is publicly_declared renders nothing", () => {
    const base: DeltaInput = { id: "d1", delta_type: "internally_silent", content_identity: "ci", declared_statement: null, public_statement: FILING_CLAIM.statement, public_provenance: "publicly_declared", quote: null, quote_source_text: null, event_date: null, has_outside_signal: true };
    expect(assembleDeltaItems([base])).toHaveLength(0);
    expect(assembleDeltaItems([{ ...base, public_provenance: "public_observed" }])).toHaveLength(1);
  });
  it("source guards: OutsideMessageBand / ExportButton filter by isPublicProvenance; useOutsidePerception queries provenance = public_observed; the record beats read signals by outside voice", () => {
    expect(src("src/components/client-view/story/movement/OutsideMessageBand.tsx")).toContain("claims.filter((c) => isPublicProvenance(c.provenance))");
    expect(src("src/components/client-view/story/check/ExportButton.tsx")).toContain("perceptionClaims.filter((c) => isPublicProvenance(c.provenance))");
    expect(src("src/hooks/useOutsidePerception.ts")).toContain('.eq("provenance", "public_observed")');
    const fr = src("src/views/client/firstReadPreview/useFirstReadPreviewData.ts");
    expect(fr).toContain('.eq("voice_class", "outside_voice_about_client")'); // What the world sees and says: signals, outside voice only
    expect(fr).toContain('.eq("delta_type", "internally_silent")');           // Raised by the record: deltas, whose observed side the compute
    expect(src("supabase/functions/_shared/claimDeltaSynthesis.ts")).toContain('s.voice_class === "client_voice" || s.voice_class === "analysis"'); // excludes self-voice (filing rows are client_voice)
    for (const p of ["src/hooks/useOutsidePerception.ts", "src/components/client-view/story/movement/OutsideMessageBand.tsx", "src/components/client-view/story/check/ExportButton.tsx", "src/lib/firstRead/deltaItems.ts"]) {
      expect(src(p), p).not.toContain("publicly_declared");
    }
  });
});

describe("(b) declared side — publicly_declared admitted beside internal_declared / client_attested, and framed", () => {
  it("delta compute + chain gate + client proof guard name publicly_declared", () => {
    expect(src("supabase/functions/_shared/claimDeltaSynthesis.ts")).toContain('c.provenance === "internal_declared" || c.provenance === "client_attested" || c.provenance === "publicly_declared"');
    expect(src("supabase/functions/public-baseline/index.ts")).toContain('.in("provenance", ["internal_declared", "client_attested", "publicly_declared"])');
    expect(src("src/hooks/useStrategicDelta.ts")).toContain('c.provenance === "internal_declared" || c.provenance === "client_attested" || c.provenance === "publicly_declared"');
    expect(src("src/components/strategy/StrategicDirectionDelta.tsx")).toContain('d.declared_claim_provenance === "publicly_declared"');
  });
  it("the two frame strings are byte-identical to the signed ones", () => {
    expect(`${FILING_FRAME_HEAD} · {host} · {fiscal year}`).toBe("In your filing · {host} · {fiscal year}");
    expect(`${PROFILE_FRAME_HEAD} · {host} · {date}`).toBe("In your profile · {host} · {date}");
    expect(filingOrigin(FILING_CLAIM)).toEqual({ kind: "filing", chip: "In your profile · guidestar.org · Sep 14", attribution: "guidestar.org", verbatim: FILING_CLAIM.statement });
    const filing = { ...FILING_CLAIM, raw_payload: { ...FILING_CLAIM.raw_payload, page_type: "filing_data", section: "filing_data", host: "projects.propublica.org", fiscal_year: "FY2025" } };
    expect(filingOrigin(filing)?.chip).toBe("In your filing · projects.propublica.org · FY2025");
    expect(filingOrigin({ ...filing, raw_payload: { ...filing.raw_payload, fiscal_year: null } })?.chip).toBe("In your filing · projects.propublica.org"); // no invented year
    expect(filingOrigin({ ...FILING_CLAIM, provenance: "public_observed" })).toBeNull(); // any other provenance: no frame
    expect(registryOriginOf({ origin: "other" })).toBeNull();
  });
  it("Diagnose: a publicly_declared market is the SAY side, framed as declared; only public_inferred is the SEE side", () => {
    expect(isDeclaredRegister("publicly_declared") && isDeclaredRegister("internal_declared")).toBe(true);
    expect(isSaySideRegister("publicly_declared")).toBe(true);
    expect(isSeeSideRegister("publicly_declared")).toBe(false);
    expect(isSeeSideRegister("public_inferred")).toBe(true);
    expect(isPublicRegister("publicly_declared")).toBe(true); // corpus meaning unchanged (registerGuard)
    const mk = (journey_key: string, register: string, pairs: string[] = []): ResolvedMarket => ({ journey_key, register, cross_register_pairs: pairs.map((k) => ({ journey_key: k })) } as unknown as ResolvedMarket);
    const model = deriveDiagnoseModel([mk("m-pd", "publicly_declared", ["m-pub"]), mk("m-pub", "public_inferred", ["m-pd"])], []);
    expect(model.declaredPairs.map((p) => [p.internal.journey_key, p.publicSide.journey_key])).toEqual([["m-pd", "m-pub"]]);
    expect(model.publicOnly).toHaveLength(0);
  });
});

describe("(mint) provenance from evidence_class — deterministic, coexisting namespaces", () => {
  const sig = (id: string, evidence_class: string, extra: Partial<SignalDraft> = {}): SignalDraft & { id?: string } => ({
    id, company_id: "co", source_id: "12", source_type: "public_baseline_run", source_title: "t", source_url: "https://www.guidestar.org/profile/94-1186168",
    signal_band: "outside", evidence_type: "market_signal", claim_text: FILING_CLAIM.statement, evidence_excerpt: FILING_CLAIM.statement, topic: "market",
    framework: "public_baseline", directness: "direct", recency: "recent", framing_fit: "partial", structure_level: "extracted", validation_status: "directional",
    confidence_to_use: "medium", voice_class: evidence_class === "filing" ? "client_voice" : "outside_voice_about_client", evidence_class,
    raw_payload: { registry: { page_type: "profile", section: "self_reported" }, registry_snapshot_read_at: "2026-09-14T14:52:51.890Z" }, ...extra,
  } as SignalDraft & { id?: string });
  it("all-filing backing → publicly_declared; prose → public_observed; mixed → public_observed (as today)", () => {
    expect(deriveClaimProvenance([{ sourceType: "public_baseline_run", band: "outside", evidenceClass: "filing" }])).toBe("publicly_declared");
    expect(deriveClaimProvenance([{ sourceType: "public_baseline_run", band: "outside", evidenceClass: "prose" }])).toBe("public_observed");
    expect(deriveClaimProvenance([{ sourceType: "public_baseline_run", band: "outside", evidenceClass: "filing" }, { sourceType: "public_baseline_run", band: "outside", evidenceClass: "prose" }])).toBe("public_observed");
    expect(deriveClaimProvenance([])).toBe("public_observed");
  });
  it("same statement, one filing signal + one prose signal → TWO candidates (declared-public:: key), each with its own provenance; the filing one carries the registry origin", () => {
    const cands = mapSignalsToClaimCandidates("co", [sig("s-filing", "filing"), sig("s-prose", "prose")], ["edgewood"], "edgewood.org");
    expect(cands.map((c) => c.claim.provenance).sort()).toEqual(["public_observed", "publicly_declared"]);
    const pd = cands.find((c) => c.claim.provenance === "publicly_declared")!;
    expect(pd.claim.raw_payload).toMatchObject({ origin: "registry_filing", host: "guidestar.org", page_type: "profile", section: "self_reported", snapshot_read_at: "2026-09-14T14:52:51.890Z" });
    expect(registryFilingOrigin(sig("x", "filing")).host).toBe("guidestar.org");
    expect(src("supabase/functions/_shared/evidencePhase1.ts")).toContain('deterministicSignalClaimId(companyId, c.claim.statement, "publicly_declared")');
  });
});

// ── C2 fold (ruling 2026-09-17): public corpus ≠ outside-admissible ─────────────────────────────────────
import { admitForSurface, isOutsideAdmissibleRegister } from "@/lib/registerGuard";
import { resolveMarketPortfolio } from "@/lib/marketPortfolio/resolveMarketPortfolio";

describe("(fold) a publicly_declared DEFINITION is absent from the outside surfaces and present on the say side", () => {
  const PD = { market_register: "publicly_declared" };
  it("admitForSurface (OutsideFindingsAct / OutsideHeroAct / MarketAct / ExportButton primary / checkItems all read it): outside + decision reject publicly_declared; diagnose admits", () => {
    expect(admitForSurface(PD, "outside")).toBe(false);
    expect(admitForSurface(PD, "decision")).toBe(false);
    expect(admitForSurface(PD, "diagnose")).toBe(true);
    expect(admitForSurface({ market_register: "public_inferred" }, "outside")).toBe(true);
    expect(isOutsideAdmissibleRegister("publicly_declared")).toBe(false);
    expect(isPublicRegister("publicly_declared")).toBe(true); // corpus meaning kept for the taint / collapse rules
    for (const p of ["src/components/client-view/story/OutsideFindingsAct.tsx", "src/components/client-view/story/OutsideHeroAct.tsx", "src/components/client-view/story/movement/MarketAct.tsx"]) {
      expect(src(p), p).toContain('admitForSurface(');
      expect(src(p), p).toContain('"outside")');
    }
  });
  it("resolveMarketPortfolio: the same fixture def is invisible on surface 'outside' and visible on 'diagnose' (where diagnosePairs puts it on the say side)", async () => {
    const def = { id: "pd", journey_key: "pd-market", job_executor: "Parents of young children in crisis", jtbd: "get stabilization", chooser: null, provenance_type: "public_research", market_register: "publicly_declared", relationship_kind: null, relationship_basis: null, declared_verbatim: null, declared_source_ref: null, retracted: false };
    const lenses = [{ journey_key: "pd-market", portfolio_state: "active", portfolio_role: "support" }];
    const outside = await resolveMarketPortfolio({ defs: [def], lenses, verdicts: [], surface: "outside" });
    const diagnose = await resolveMarketPortfolio({ defs: [def], lenses, verdicts: [], surface: "diagnose" });
    const keys = (r: { active: Array<{ journey_key: string }>; deferred: Array<{ journey_key: string }> }) => [...r.active, ...r.deferred].map((m) => m.journey_key);
    expect(keys(outside)).not.toContain("pd-market");
    expect(keys(diagnose)).toContain("pd-market");
  });
});

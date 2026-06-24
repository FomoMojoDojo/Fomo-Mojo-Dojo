// Home view header company-switcher — relocated verbatim from ClientRefinePreviewView (strand 3b batch 5).
import type { Dispatch, SetStateAction, RefObject } from "react";
import { stageLabel } from "@/lib/phaseDisplay";
import type { Company } from "@/hooks/useCompany";
import type { ClaimState } from "@/lib/claimState";
import { toSentence } from "./shared";

export function HeaderCompanySwitcher({
  showHeaderSwitcher, setShowHeaderSwitcher, headerSwitcherRef, activeCompany, companies, setActiveCompanyId, ENGAGEMENT_DAY, dominantClaimState, phase,
}: {
  showHeaderSwitcher: boolean;
  setShowHeaderSwitcher: Dispatch<SetStateAction<boolean>>;
  headerSwitcherRef: RefObject<HTMLDivElement>;
  activeCompany: Company | null;
  companies: Company[];
  setActiveCompanyId: (id: string) => void;
  ENGAGEMENT_DAY: number | null;
  dominantClaimState: ClaimState | null;
  phase: string;
}) {
  return (
                  <div className="crpv-co-switcher" ref={headerSwitcherRef}>
                    <button
                      type="button"
                      className="crpv-co-trigger cap"
                      onClick={() => setShowHeaderSwitcher((v) => !v)}
                      aria-haspopup="listbox"
                      aria-expanded={showHeaderSwitcher}
                    >
                      [{toSentence(activeCompany?.name) || "COMPANY"}]
                      <span className="crpv-co-caret">{showHeaderSwitcher ? "▲" : "▼"}</span>
                    </button>
                    <span className="cap" style={{ marginLeft: 4 }}>· DAY {ENGAGEMENT_DAY ?? "—"} · {dominantClaimState ? dominantClaimState.replace(/_/g, " ").toUpperCase() : stageLabel(phase).toUpperCase()}</span>
                    {showHeaderSwitcher && (
                      <div className="crpv-co-dropdown" role="listbox">
                        <ul className="crpv-co-list">
                          {companies.map((c) => (
                            <li key={c.id}>
                              <button
                                type="button"
                                className={`crpv-co-option${c.id === activeCompany?.id ? " active" : ""}`}
                                role="option"
                                aria-selected={c.id === activeCompany?.id}
                                onClick={() => { setActiveCompanyId(c.id); setShowHeaderSwitcher(false); }}
                              >
                                <span className="crpv-co-option-name">{c.name}</span>
                                <span className="crpv-co-option-meta cap">
                                  {[c.quarter, c.archetype, c.mojo_score != null ? `score ${Math.round(c.mojo_score)}` : null].filter(Boolean).join(" · ")}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
  );
}

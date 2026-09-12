// Workspace home (comp port 2b — P:421-424, fr tokens): the hero and a 3-column grid of the seven page
// cards (numeral, title, the signed card description, ›), each linking to its page. No score block.
// The Opportunities card's count is live: odi_needs (company-wide) via useOdiNeeds — the signed line is
// split around it (accepted fix 4).
import { Link } from "react-router-dom";
import { useCompany } from "@/hooks/useCompany";
import { useOdiNeeds } from "@/hooks/useOdiNeeds";
import { WorkspaceHeroPage } from "./WorkspaceHeroPage";
import { WORKSPACE_PAGES, WORKSPACE_STRINGS, workspacePagePath } from "./workspaceNav";

const CARD_ORDER = ["inputs", "job-map", "positioning", "strategy", "opportunities", "council", "routes"] as const;

export default function WorkspaceIndexPage() {
  const { activeCompany } = useCompany();
  const { needs } = useOdiNeeds(activeCompany?.id);
  const cards = CARD_ORDER.map((k) => WORKSPACE_PAGES.find((p) => p.key === k)).filter((p): p is NonNullable<typeof p> => Boolean(p && (p.cardDescription || p.cardDescriptionParts)));
  return (
    <WorkspaceHeroPage eyebrow={WORKSPACE_STRINGS.indexSection} title={WORKSPACE_STRINGS.heroHome} accent={WORKSPACE_STRINGS.heroHomeAccent}>
      <div className="fr-ws-cards" data-fr-region="cards" data-testid="home-cards">
        {cards.map((p) => (
          <Link key={p.key} to={workspacePagePath(p)} className="fr-ws-card" data-fr-card={p.key} data-testid="home-card">
            <span className="fr-ws-card-num fr-mono" aria-hidden="true" />
            <h2 className="fr-ws-card-title">{p.label}</h2>
            <p className="fr-ws-card-text">
              {p.cardDescriptionParts
                ? <>{p.cardDescriptionParts[0]} <span data-testid="home-card-count">{needs.length}</span> {p.cardDescriptionParts[1]}</>
                : p.cardDescription}
            </p>
            <svg className="fr-ws-card-arrow" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M6 3 L11 8 L6 13" fill="none" stroke="currentColor" strokeWidth="1.25" /></svg>
          </Link>
        ))}
      </div>
    </WorkspaceHeroPage>
  );
}

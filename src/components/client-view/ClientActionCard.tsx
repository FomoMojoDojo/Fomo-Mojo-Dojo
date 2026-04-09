import { MetaBadge, TierBadge } from "@/components/ui/semantic-badges";
import type { ClientActionConfidenceTag, ClientActionSummary } from "@/lib/clientViewModel";

type ClientActionCardProps = {
  action: ClientActionSummary;
  compact?: boolean;
  minimalOwnership?: boolean;
  confidenceTag?: ClientActionConfidenceTag;
  emphasis?: "primary" | "secondary" | "default";
};

function statusLabel(status: ClientActionSummary["status"]) {
  if (status === "in_progress") return "In Progress";
  if (status === "done") return "Done";
  if (status === "planned") return "Planned";
  return "Parked";
}

function categoryTone(category: ClientActionSummary["category"]) {
  if (category === "Fix") return "focus" as const;
  if (category === "Improve") return "monitor" as const;
  return "defer" as const;
}

export default function ClientActionCard({
  action,
  compact = false,
  minimalOwnership = false,
  confidenceTag,
  emphasis = "default",
}: ClientActionCardProps) {
  const categoryToneValue = categoryTone(action.category);
  const unowned = !action.isOwned;

  const emphasisClass =
    emphasis === "primary"
      ? "border-forest/35 shadow-sm"
      : emphasis === "secondary"
        ? "border-[#e7efec] bg-[#fbfdfc]"
        : unowned
          ? "border-rust/35"
          : "border-[#d8e1de]";

  return (
    <article
      className={`rounded-xl border bg-white p-4 ${compact ? "" : "h-full"} ${emphasisClass}`}
    >
      <div className="flex items-start gap-2">
        <TierBadge tone={categoryToneValue}>{action.category}</TierBadge>
      </div>

      <h3 className="mt-2 truncate font-sans text-[15px] font-semibold leading-[1.35] text-t-primary" title={action.title}>
        {action.title}
      </h3>
      <p className="mt-2 font-sans text-[12px] leading-[1.6] text-t-secondary">
        {action.whyItMatters}
      </p>
      {action.ifSolved.length > 0 ? (
        <div className="mt-3 rounded-lg bg-[#f8fbfa] px-3 py-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-t-muted">If solved</p>
          <ul className="mt-1 space-y-1">
            {action.ifSolved.slice(0, 3).map((item) => (
              <li key={`${action.id}-${item}`} className="font-sans text-[12px] leading-[1.45] text-t-secondary">
                {item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <MetaBadge>Owner: {action.primaryOwner || "No owner yet"}</MetaBadge>
        <MetaBadge>Status: {statusLabel(action.status)}</MetaBadge>
        {!minimalOwnership && action.decider ? <MetaBadge>Decider: {action.decider}</MetaBadge> : null}
      </div>

      {!minimalOwnership && action.contributors.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-t-muted">Contributors</span>
          {action.contributors.slice(0, 3).map((contributor) => (
            <MetaBadge key={`${action.id}-${contributor}`}>{contributor}</MetaBadge>
          ))}
        </div>
      ) : null}

      {confidenceTag && !(confidenceTag === "Assumed" && action.isOwned) ? (
        <p
          className={`mt-2 font-mono text-[10px] uppercase tracking-[0.08em] ${
            confidenceTag === "Validated"
              ? "text-forest"
              : confidenceTag === "Needs validation"
                ? "text-amber"
                : "text-rust"
          }`}
        >
          {confidenceTag}
        </p>
      ) : null}

      {unowned ? (
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.08em] text-rust">
          No owner yet · assign one to move this forward
        </p>
      ) : null}
    </article>
  );
}

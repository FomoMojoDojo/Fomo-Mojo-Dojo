import TopNav from "@/components/layout/TopNav";
import { useCompany } from "@/hooks/useCompany";
import { useStrategyCascade } from "@/hooks/useStrategyCascade";
import { useSourceConfidence } from "@/hooks/useSourceConfidence";
import { MetaBadge } from "@/components/ui/semantic-badges";
import { SourceLegend } from "@/components/provenance/SourceLegend";
import type { CascadeAssumption, CascadeItem } from "@/lib/types";

const c = {
  bg: "#faf7f6",
  panel: "#FFFFFF",
  paper: "#FFFFFF",
  line: "#DDE6D1",
  lineFaint: "#EEF3E9",
  charcoal: "#233C4B",
  secondary: "#46606D",
  muted: "#6E847F",
  coral: "#FF7D2D",
  teal: "#5F9B8C",
  amber: "#FAC846",
};

function sectionLabel(text: string) {
  return (
    <div
      className="font-mono text-[10px] uppercase tracking-[0.14em]"
      style={{ color: c.muted }}
    >
      {text}
    </div>
  );
}

function connector() {
  return (
    <div className="flex justify-center py-2">
      <div className="flex flex-col items-center">
        <div className="h-5 w-px" style={{ background: c.line }} />
        <div className="font-sans text-[18px] leading-none" style={{ color: c.amber }}>
          ↓
        </div>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div
      className="rounded-[24px] border px-6 py-12 text-center"
      style={{ borderColor: c.line, background: c.panel }}
    >
      <p className="font-sans text-[15px]" style={{ color: c.secondary }}>
        {message}
      </p>
    </div>
  );
}

function NarrativeBlock({
  label,
  text,
}: {
  label: string;
  text: string;
}) {
  return (
    <section
      className="rounded-[24px] border px-5 py-5 sm:px-6"
      style={{ borderColor: c.line, background: c.panel }}
    >
      {sectionLabel(label)}
      <p
        className="mt-3 font-sans text-[15px] leading-[1.9] sm:text-[16px]"
        style={{ color: c.charcoal }}
      >
        {text}
      </p>
    </section>
  );
}

function statusTone(status: CascadeItem["status"]) {
  if (status === "strong") return { dot: c.teal, text: "STRONG" };
  if (status === "gap") return { dot: c.coral, text: "GAP" };
  return { dot: c.amber, text: "DEVELOPING" };
}

function CapabilityCard({ item }: { item: CascadeItem }) {
  const tone = statusTone(item.status);

  return (
    <div
      className="rounded-[18px] border p-4"
      style={{ borderColor: c.line, background: c.paper }}
    >
      <p className="font-sans text-[15px] font-semibold leading-[1.45]" style={{ color: c.charcoal }}>
        {item.name}
      </p>
      <p
        className="mt-3 font-mono text-[10px] uppercase tracking-[0.1em]"
        style={{ color: tone.dot }}
      >
        {tone.text}
      </p>
      {item.note ? (
        <p className="mt-2 font-sans text-[12px] leading-[1.55]" style={{ color: c.secondary }}>
          {item.note}
        </p>
      ) : null}
    </div>
  );
}

function GridSection({
  label,
  items,
}: {
  label: string;
  items: CascadeItem[];
}) {
  return (
    <section
      className="rounded-[24px] border px-5 py-5 sm:px-6"
      style={{ borderColor: c.line, background: c.panel }}
    >
      {sectionLabel(label)}
      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {items.map((item, index) => (
          <CapabilityCard key={`${label}-${item.name}-${index}`} item={item} />
        ))}
      </div>
    </section>
  );
}

function AssumptionRow({ item }: { item: CascadeAssumption }) {
  return (
    <div
      className="rounded-[18px] border p-4"
      style={{ borderColor: c.line, background: c.paper }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-sans text-[15px] leading-[1.5]" style={{ color: c.charcoal }}>
            {item.assumption}
          </p>
          {(item.note || item.outcome) ? (
            <p className="mt-2 font-sans text-[12px] leading-[1.6]" style={{ color: c.secondary }}>
              {item.note || item.outcome}
            </p>
          ) : null}
        </div>

        <MetaBadge>{item.tested ? "Tested" : "Untested"}</MetaBadge>
      </div>
    </div>
  );
}

export default function StrategyView() {
  const { activeCompany } = useCompany();
  const { loading, item, error } = useStrategyCascade(activeCompany?.id);
  const { signals: sourceSignals } = useSourceConfidence({
    companyId: activeCompany?.id,
    areaScoresJson: activeCompany?.area_scores_json,
  });

  return (
    <div
      className="min-h-screen"
      style={{
        background: c.bg,
        backgroundImage:
          'url("data:image/svg+xml,%3Csvg width=\'6\' height=\'6\' viewBox=\'0 0 6 6\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'%23000\' fill-opacity=\'0.025\'%3E%3Cpath d=\'M5 0h1L0 5V4zM6 5v1H5z\'/%3E%3C/g%3E%3C/svg%3E")',
      }}
    >
      <TopNav />

      <main className="mx-auto max-w-[1120px] px-4 pb-12 pt-6 sm:px-6 md:px-8">
        <div className="mb-8 border-b pb-5" style={{ borderColor: c.line }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                {activeCompany?.name || "No company selected"}
              </div>
              <h1 className="mt-2 font-sans text-[34px] font-semibold" style={{ color: c.charcoal }}>
                Strategy Cascade
              </h1>
              <p className="mt-2 max-w-3xl font-sans text-[15px] leading-[1.7]" style={{ color: c.secondary }}>
                A good strategy is a set of reinforcing choices. This cascade shows the current
                strategic logic from aspiration through capabilities, management systems, and the
                assumptions that still need proof.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <MetaBadge>
                {activeCompany?.last_scored_at
                  ? `Updated ${new Date(activeCompany.last_scored_at).toLocaleDateString()}`
                  : "Awaiting research"}
              </MetaBadge>
              <SourceLegend signals={sourceSignals} />
            </div>
          </div>
        </div>

        {!activeCompany?.id ? (
          <EmptyState message="Select a company to view its strategy cascade." />
        ) : loading ? (
          <EmptyState message="Loading strategy cascade…" />
        ) : error ? (
          <EmptyState message={`Failed to load strategy cascade: ${error}`} />
        ) : !item ? (
          <EmptyState message="No structured strategy cascade yet. Run AI Research again to generate the full cascade view." />
        ) : (
          <div className="space-y-1">
            <NarrativeBlock
              label="Winning Aspiration"
              text={item.winning_aspiration || "No winning aspiration generated yet."}
            />

            {connector()}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <NarrativeBlock
                label="Where To Play"
                text={item.where_to_play || "No where-to-play definition generated yet."}
              />
              <NarrativeBlock
                label="How To Win"
                text={item.how_to_win || "No how-to-win logic generated yet."}
              />
            </div>

            {connector()}

            <GridSection
              label="Required Capabilities"
              items={item.capabilities}
            />

            {connector()}

            <GridSection
              label="Management Systems"
              items={item.management_systems}
            />

            {connector()}

            <section
              className="rounded-[24px] border px-5 py-5 sm:px-6"
              style={{ borderColor: c.line, background: c.panel }}
            >
              {sectionLabel("Assumptions Tracker")}
              <p className="mt-3 max-w-4xl font-sans text-[14px] leading-[1.7]" style={{ color: c.secondary }}>
                These are the beliefs the strategy currently rests on. Untested assumptions carry
                risk and should be converted into evidence-backed validation work.
              </p>

              <div className="mt-4 space-y-3">
                {item.assumptions.map((assumption, index) => (
                  <AssumptionRow key={`${assumption.assumption}-${index}`} item={assumption} />
                ))}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

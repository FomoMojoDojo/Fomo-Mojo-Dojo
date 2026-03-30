import { useEffect, useMemo, useState } from "react";
import { scoreColor } from "@/lib/scoring";
import ScoreBar from "@/components/ui/ScoreBar";
import { useDeepDiveAnalyses, useGenerateDeepDive } from "@/hooks/useDeepDive";
import { useLlmTraceDebug } from "@/hooks/useLlmTraceDebug";
import { useAuth } from "@/hooks/useAuth";
import { useInputs } from "@/hooks/useInputs";
import type { DeepDive, ScoreArea } from "@/lib/types";
import { fileSupportsArea, type AreaKey } from "@/lib/areaMapping";

interface Props {
  open: boolean;
  areaKey: string | null;
  onClose: () => void;
  dynamicAreas?: ScoreArea[];
}

const AREA_RELATIONS: Record<string, string[]> = {
  positioning: ["product", "marketing", "sales", "cx"],
  strategy: ["product", "marketing", "sales", "cx"],
  product: ["sales", "cx"],
  marketing: ["sales", "cx"],
  sales: ["cx"],
  cx: [],
};

const c = {
  panel: "#FAF7F6",
  card: "#FFFFFF",
  line: "#DDE6D1",
  lineFaint: "#EEF3E9",
  charcoal: "#233C4B",
  secondary: "#46606D",
  muted: "#6E847F",
  coral: "#FF7D2D",
  teal: "#5F9B8C",
  amber: "#FAC846",
};

export default function DeepDivePanel({ open, areaKey, onClose, dynamicAreas }: Props) {
  const [activeTab, setActiveTab] = useState(0);
  const { user, isAdmin } = useAuth();
  const { enabled: llmTraceEnabled } = useLlmTraceDebug();
  const { query: inputsQuery } = useInputs();
  const { data: dbAnalyses } = useDeepDiveAnalyses();
  const generateMutation = useGenerateDeepDive();
  const inputs = inputsQuery.data ?? [];

  const areas = dynamicAreas ?? [];
  const area = areas.find((a) => a.area_key === areaKey);

  const deepDive: DeepDive | null = areaKey ? (dbAnalyses?.[areaKey] ?? null) : null;

  const isGenerating = generateMutation.isPending;
  const hasAnyUploadedFiles = useMemo(() => inputs.some((input) => input.files.length > 0), [inputs]);
  const areaMappedFiles = useMemo(() => {
    if (!areaKey) return [] as Array<{ id: string; fileName: string; inputLabel: string }>;
    const normalizedArea = areaKey as AreaKey;
    const matched: Array<{ id: string; fileName: string; inputLabel: string }> = [];
    for (const input of inputs) {
      for (const file of input.files) {
        if (
          !fileSupportsArea({
            areaKey: normalizedArea,
            input,
            fileName: file.file_name,
            tags: file.tags,
          })
        ) {
          continue;
        }
        matched.push({
          id: file.id,
          fileName: file.file_name,
          inputLabel: input.input_label,
        });
      }
    }
    const seen = new Set<string>();
    return matched.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [areaKey, inputs]);

  const hasAreaUploadedFiles = areaMappedFiles.length > 0;
  const analysisRunLabel = hasAreaUploadedFiles ? "uploaded evidence" : "current inputs";

  useEffect(() => {
    setActiveTab(0);
  }, [areaKey]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open, onClose]);

  function handleRegenerate() {
    if (!areaKey || isGenerating) return;
    generateMutation.mutate(areaKey);
  }

  const hasDbAnalysis = !!(user && dbAnalyses?.[areaKey ?? ""]);
  const tabs = ["What We Found", "What Good Looks Like", "Your Path Forward"];

  return (
    <>
      <div
        className={`fixed inset-0 z-40 transition-opacity duration-300 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        style={{ background: "rgba(35,60,75,0.26)", top: 52 }}
        onClick={onClose}
      />

      <div
        className="fixed right-0 z-50 flex flex-col border-l"
        style={{
          top: 52,
          width: 520,
          maxWidth: "100vw",
          height: "calc(100vh - 52px)",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)",
          background: c.panel,
          borderColor: c.line,
        }}
      >
        {area ? (
          <>
            <div className="relative border-b px-6 pb-4 pt-5" style={{ borderColor: c.line }}>
              <p className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
                Map View &gt; {area.area_label}
              </p>
              <h2 className="mt-1 font-sans text-[24px] font-semibold leading-[1.15]" style={{ color: c.charcoal }}>
                {area.area_label}
              </h2>
              <button
                onClick={onClose}
                className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-md border text-sm transition-colors"
                style={{ borderColor: c.line, color: c.secondary, background: c.card }}
                aria-label="Close deep dive panel"
              >
                x
              </button>
            </div>

            <div className="border-b px-6 py-4" style={{ borderColor: c.line }}>
              <div className="mb-2 flex items-end gap-3">
                <span className="font-sans text-[46px] font-semibold leading-none" style={{ color: scoreColor(area.score) }}>
                  {area.score.toFixed(1)}
                </span>
                <span
                  className="mb-2 font-mono text-[11px] uppercase tracking-[0.08em]"
                  style={{ color: c.secondary }}
                  title="Compared with the previous saved score for this area"
                >
                  {area.trend === "up"
                    ? "Trend: improving"
                    : area.trend === "down"
                      ? "Trend: declining"
                      : "Trend: stable"}
                </span>
              </div>
              <ScoreBar score={area.score} ceiling={area.ceiling} height={9} />
              {area.ceiling != null ? (
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                  Capped at {area.ceiling.toFixed(1)} by Positioning
                </p>
              ) : null}
              <p className="mt-1 font-sans text-[12px]" style={{ color: c.secondary }}>
                {area.status_note}
              </p>
            </div>

            {user ? (
              <div className="border-b px-6 py-3" style={{ borderColor: c.line }}>
                <button
                  onClick={handleRegenerate}
                  disabled={isGenerating}
                  className="flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2.5 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors disabled:opacity-50"
                  style={{ borderColor: c.line, color: c.charcoal, background: c.card }}
                >
                  {isGenerating ? (
                    <>
                      <div
                        className="h-3 w-3 animate-spin rounded-full border-2 border-t-transparent"
                        style={{ borderColor: c.secondary, borderTopColor: "transparent" }}
                      />
                      Analyzing {analysisRunLabel}...
                    </>
                  ) : hasDbAnalysis ? (
                    "Re-analyze with latest evidence"
                  ) : (
                    "Analyze with AI"
                  )}
                </button>

                <p className="mt-2 font-sans text-[12px] leading-[1.6]" style={{ color: c.secondary }}>
                  {hasAreaUploadedFiles
                    ? "This analysis uses client-scoped uploaded evidence for this area on your local internal AI path."
                    : hasAnyUploadedFiles
                      ? "No uploaded files are mapped to this area yet. This run uses current inputs only and is provisional."
                      : "No uploaded files exist for this company yet. This run uses current inputs only and is provisional."}
                </p>

                {hasAreaUploadedFiles ? (
                  <div className="mt-2 rounded-lg border p-2.5" style={{ borderColor: c.line, background: c.card }}>
                    <p className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
                      Mapped files ({areaMappedFiles.length})
                    </p>
                    <div className="mt-1 space-y-1">
                      {areaMappedFiles.slice(0, 4).map((file) => (
                        <p key={file.id} className="font-sans text-[12px]" style={{ color: c.secondary }}>
                          {file.fileName} - {file.inputLabel}
                        </p>
                      ))}
                      {areaMappedFiles.length > 4 ? (
                        <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                          +{areaMappedFiles.length - 4} more
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="border-b px-3 py-2" style={{ borderColor: c.line }}>
              <div className="flex flex-wrap gap-2">
                {tabs.map((tab, i) => {
                  const active = activeTab === i;
                  return (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(i)}
                      className="rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors"
                      style={{
                        borderColor: active ? "#E6CFC2" : c.line,
                        color: active ? c.charcoal : c.secondary,
                        background: active ? "#FFF4EC" : c.card,
                      }}
                    >
                      {tab}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {deepDive ? (
                <>
                  {activeTab === 0 ? (
                    <TabWhatWeFound
                      deepDive={deepDive}
                      hasAreaUploadedFiles={hasAreaUploadedFiles}
                      showLlmTrace={Boolean(llmTraceEnabled && isAdmin)}
                    />
                  ) : null}
                  {activeTab === 1 ? <TabWhatGoodLooksLike deepDive={deepDive} area={area} /> : null}
                  {activeTab === 2 ? <TabPathForward deepDive={deepDive} areaKey={areaKey!} /> : null}
                </>
              ) : (
                <p className="px-3 py-12 text-center font-sans text-[14px] italic leading-[1.7]" style={{ color: c.secondary }}>
                  {user
                    ? hasAreaUploadedFiles
                      ? 'Click "Analyze with AI" above to generate insights from your uploaded evidence.'
                      : 'Click "Analyze with AI" above to generate a provisional analysis from current inputs. Upload files to strengthen evidence.'
                    : "Your strategist is preparing the detailed analysis for this area. It will appear here after your next session."}
                </p>
              )}
            </div>

            <div className="border-t px-6 py-4" style={{ borderColor: c.line }}>
              <button
                className="w-full rounded-md border px-3 py-2.5 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors"
                style={{ borderColor: c.line, color: c.charcoal, background: c.card }}
              >
                Work on This with Your Strategist
              </button>
              <button
                onClick={onClose}
                className="mt-2 w-full rounded-md border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors"
                style={{ borderColor: c.line, color: c.secondary, background: c.card }}
              >
                Back to Map View
              </button>
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center px-8 text-center">
            <p className="font-sans text-[14px] italic leading-[1.7]" style={{ color: c.secondary }}>
              No score area is available yet for this panel. Run Web Baseline and AI Research first.
            </p>
          </div>
        )}
      </div>
    </>
  );
}

function TabWhatWeFound({
  deepDive,
  hasAreaUploadedFiles,
  showLlmTrace,
}: {
  deepDive: DeepDive;
  hasAreaUploadedFiles: boolean;
  showLlmTrace: boolean;
}) {
  const traceMatch = deepDive.what_we_found.match(/\[LLM_TRACE\]([\s\S]*?)\[\/LLM_TRACE\]/);
  const traceRaw = traceMatch?.[1] ?? "";
  const bodyText = traceMatch ? deepDive.what_we_found.replace(traceMatch[0], "").trim() : deepDive.what_we_found;

  const traceLines = traceRaw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const provider =
    traceLines.find((line) => line.toLowerCase().startsWith("provider:"))?.split(":").slice(1).join(":").trim() ||
    "unknown";
  const model =
    traceLines.find((line) => line.toLowerCase().startsWith("model:"))?.split(":").slice(1).join(":").trim() ||
    "unknown";
  const endpoint =
    traceLines.find((line) => line.toLowerCase().startsWith("endpoint:"))?.split(":").slice(1).join(":").trim() ||
    "unknown";

  const uploadedFiles =
    (traceLines
      .find((line) => line.toLowerCase().startsWith("uploaded_files:"))
      ?.split(":")
      .slice(1)
      .join(":")
      .trim() || "")
      .split("|")
      .map((item) => item.trim())
      .filter((item) => item && item !== "none");

  const snippets = traceLines
    .filter((line) => line.toLowerCase().startsWith("snippet:"))
    .map((line) => line.replace(/^snippet:\s*/i, ""))
    .map((line) => {
      const divider = line.indexOf("::");
      if (divider === -1) return { file: "unknown", text: line.trim() };
      return {
        file: line.slice(0, divider).trim(),
        text: line.slice(divider + 2).trim(),
      };
    })
    .filter((item) => item.text && !item.text.startsWith("none ::"));

  return (
    <div>
      <div className="mb-4 rounded-xl border p-4" style={{ borderColor: c.line, background: c.card }}>
        <p className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: c.muted }}>
          Why this matters
        </p>
        <p className="mt-2 font-sans text-[13px] leading-[1.7]" style={{ color: c.secondary }}>
          {deepDive.why_it_matters}
        </p>
      </div>

      {showLlmTrace ? (
        <div className="mb-4 rounded-xl border p-4" style={{ borderColor: c.line, background: c.card }}>
          <p className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: c.muted }}>
            LLM Evidence Trace (Internal)
          </p>
          <p className="mt-2 font-sans text-[12px]" style={{ color: c.secondary }}>
            Provider: {provider} - Model: {model}
          </p>
          <p className="mt-1 break-all font-sans text-[12px]" style={{ color: c.secondary }}>
            Endpoint: {endpoint}
          </p>

          <div className="mt-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: c.muted }}>
              Uploaded files used ({uploadedFiles.length})
            </p>
            {uploadedFiles.length > 0 ? (
              <ul className="mt-1 space-y-1">
                {uploadedFiles.map((file, index) => (
                  <li key={`${file}-${index}`} className="font-sans text-[12px]" style={{ color: c.secondary }}>
                    {file}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 font-sans text-[12px]" style={{ color: c.secondary }}>
                No uploaded files were listed in trace.
              </p>
            )}
          </div>

          {snippets.length > 0 ? (
            <div className="mt-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: c.muted }}>
                Evidence snippets used
              </p>
              <div className="mt-2 space-y-2">
                {snippets.slice(0, 6).map((snippet, index) => (
                  <div key={`${snippet.file}-${index}`} className="rounded-lg border p-2.5" style={{ borderColor: c.line, background: c.panel }}>
                    <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                      {snippet.file}
                    </p>
                    <p className="mt-1 font-sans text-[12px] italic" style={{ color: c.secondary }}>
                      "{snippet.text}"
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <p className="mb-3 border-b pb-2 font-mono text-[10px] uppercase tracking-[0.12em]" style={{ borderColor: c.line, color: c.muted }}>
        Key Gaps
      </p>
      {deepDive.holding_back.length === 0 ? (
        <div className="mb-3 rounded-xl border-l-[3px] p-4" style={{ borderColor: c.teal, background: c.card }}>
          <p className="font-sans text-[14px]" style={{ color: c.teal }}>
            No critical gaps identified - evidence looks solid.
          </p>
        </div>
      ) : (
        deepDive.holding_back.map((gap, i) => (
          <div key={i} className="mb-3 rounded-xl border p-4" style={{ borderColor: c.line, background: c.card }}>
            <p className="font-sans text-[14px] font-semibold leading-[1.35]" style={{ color: c.charcoal }}>
              {gap.gap}
            </p>
            <p className="mt-1.5 font-sans text-[13px] italic leading-[1.65]" style={{ color: c.secondary }}>
              {gap.description}
            </p>
          </div>
        ))
      )}

      <p className="mb-3 mt-5 border-b pb-2 font-mono text-[10px] uppercase tracking-[0.12em]" style={{ borderColor: c.line, color: c.muted }}>
        What We Observed
      </p>
      {bodyText.split("\n\n").map((para, i) => (
        <p
          key={i}
          className="mb-3 font-sans text-[13px] leading-[1.75]"
          style={{ color: c.secondary }}
          dangerouslySetInnerHTML={{
            __html: para
              .replace(/\*\*(.*?)\*\*/g, '<strong style="color:#233C4B">$1</strong>')
              .replace(/\*(.*?)\*/g, "<em>$1</em>"),
          }}
        />
      ))}

      <div className="mt-3 rounded-lg border p-3" style={{ borderColor: c.line, background: c.card }}>
        <p className="font-sans text-[12px] italic leading-[1.65]" style={{ color: c.secondary }}>
          {hasAreaUploadedFiles
            ? "Analysis generated from your uploaded evidence and input completeness."
            : "Analysis generated from current input completeness only. Add uploaded evidence to improve confidence."}
        </p>
      </div>
    </div>
  );
}

function TabWhatGoodLooksLike({
  deepDive,
  area,
}: {
  deepDive: DeepDive;
  area: { score: number };
}) {
  return (
    <div>
      <div className="rounded-xl border p-5" style={{ borderColor: c.line, background: c.card }}>
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: c.muted }}>
          The Benchmark
        </p>
        <p className="font-sans text-[13px] leading-[1.75]" style={{ color: c.secondary }}>
          {deepDive.what_good_looks_like}
        </p>
      </div>

      <div className="mt-5 rounded-xl border p-4" style={{ borderColor: c.line, background: c.card }}>
        <p className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
          Your current gap
        </p>
        <div className="relative mt-2 h-2 rounded-full" style={{ background: c.lineFaint }}>
          <div
            className="absolute left-0 top-0 h-2 rounded-full"
            style={{ width: `${area.score}%`, background: scoreColor(area.score) }}
          />
          <div className="absolute top-[-3px] h-[14px] w-[2px] rounded-sm" style={{ left: "85%", background: c.amber }} />
        </div>
        <div className="mt-2 flex justify-between">
          <span className="font-mono text-[11px]" style={{ color: scoreColor(area.score) }}>
            Current: {area.score.toFixed(1)}
          </span>
          <span className="font-mono text-[11px]" style={{ color: c.secondary }}>
            Benchmark: ~85
          </span>
        </div>
      </div>
    </div>
  );
}

function TabPathForward({
  deepDive,
  areaKey,
}: {
  deepDive: DeepDive;
  areaKey: string;
}) {
  const related = AREA_RELATIONS[areaKey] || [];

  return (
    <div>
      {deepDive.path_forward.map((step, i) => (
        <div key={i} className="mb-3 rounded-xl border p-4" style={{ borderColor: c.line, background: c.card }}>
          <div className="flex items-start gap-3">
            <div
              className="mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border font-mono text-[10px]"
              style={{ borderColor: c.line, background: c.panel, color: c.secondary }}
            >
              {i + 1}
            </div>
            <p className="flex-1 font-sans text-[14px] font-semibold leading-[1.4]" style={{ color: c.charcoal }}>
              {step.step}
            </p>
          </div>

          <div className="ml-[34px] mt-2 flex flex-wrap items-center gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
              {step.duration}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
              {step.owner}
            </span>
            <span
              className="font-mono text-[10px] uppercase tracking-[0.08em]"
              style={{ color: step.impact_pts >= 3 ? c.teal : c.amber }}
            >
              +{step.impact_pts} pts
            </span>
          </div>

          {step.action_label ? (
            <button
              className="ml-[34px] mt-2 rounded-md border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors"
              style={{ borderColor: c.line, color: c.charcoal, background: c.panel }}
            >
              {step.action_label}
            </button>
          ) : null}
        </div>
      ))}

      {related.length > 0 ? (
        <div className="mt-4 rounded-xl border p-4" style={{ borderColor: c.line, background: c.card }}>
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
            What this unlocks
          </p>
          <p className="font-sans text-[13px] italic leading-[1.7]" style={{ color: c.secondary }}>
            Fixing {areaKey} will unlock improvements in {related.join(", ")} once resolved.
          </p>
        </div>
      ) : null}
    </div>
  );
}

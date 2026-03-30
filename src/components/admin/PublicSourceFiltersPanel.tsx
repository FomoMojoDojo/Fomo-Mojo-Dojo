import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type PublicSourceFilters = {
  exclude_source_types: string[];
  exclude_domains: string[];
  include_domains: string[];
  seed_urls: string[];
};

const SOURCE_TYPE_OPTIONS: Array<{ key: string; label: string }> = [
  { key: "employee_review", label: "Employee review sites (Glassdoor, Indeed)" },
  { key: "customer_review", label: "Customer review sites (G2, Capterra, Trustpilot)" },
  { key: "community_discussion", label: "Community discussion (Reddit, Quora, forums)" },
  { key: "profile_or_company_page", label: "Profile/company pages (LinkedIn)" },
  { key: "third_party_profile", label: "Third-party profiles (Crunchbase, PitchBook, ZoomInfo)" },
  { key: "review_signal", label: "Review/rating signals from generic web pages" },
  { key: "news_signal", label: "News/press signals from generic web pages" },
];

const STARTUP_PRESET_EXCLUSIONS = [
  "employee_review",
  "customer_review",
  "community_discussion",
  "profile_or_company_page",
  "third_party_profile",
  "review_signal",
  "news_signal",
];

function normalizeDomain(value: string) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  const stripped = raw
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split("?")[0]
    .split("#")[0]
    .trim();
  return stripped;
}

function parseDomains(value: string) {
  const parts = value
    .split(/[\n,]/g)
    .map((item) => normalizeDomain(item))
    .filter(Boolean);
  return Array.from(new Set(parts));
}

function normalizeSeedUrl(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function parseSeedUrls(value: string) {
  const parts = value
    .split(/[\n,]/g)
    .map((item) => normalizeSeedUrl(item))
    .filter(Boolean);
  return Array.from(new Set(parts));
}

function parseFilters(value: unknown): PublicSourceFilters {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

  const sourceTypes = Array.isArray(record.exclude_source_types)
    ? record.exclude_source_types.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean)
    : [];
  const excludeDomains = Array.isArray(record.exclude_domains)
    ? record.exclude_domains.map((item) => normalizeDomain(String(item || ""))).filter(Boolean)
    : [];
  const includeDomains = Array.isArray(record.include_domains)
    ? record.include_domains.map((item) => normalizeDomain(String(item || ""))).filter(Boolean)
    : [];
  const seedUrls = Array.isArray(record.seed_urls)
    ? record.seed_urls.map((item) => normalizeSeedUrl(String(item || ""))).filter(Boolean)
    : [];

  return {
    exclude_source_types: Array.from(new Set(sourceTypes.filter((item) => item !== "public_web"))),
    exclude_domains: Array.from(new Set(excludeDomains)),
    include_domains: Array.from(new Set(includeDomains)),
    seed_urls: Array.from(new Set(seedUrls)),
  };
}

export default function PublicSourceFiltersPanel({
  companyId,
  initialFiltersJson,
  onSaved,
}: {
  companyId: string;
  initialFiltersJson: unknown;
  onSaved?: () => Promise<void> | void;
}) {
  const [filters, setFilters] = useState<PublicSourceFilters>(() => parseFilters(initialFiltersJson));
  const [excludeDomainsText, setExcludeDomainsText] = useState("");
  const [includeDomainsText, setIncludeDomainsText] = useState("");
  const [seedUrlsText, setSeedUrlsText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const parsed = parseFilters(initialFiltersJson);
    setFilters(parsed);
    setExcludeDomainsText(parsed.exclude_domains.join("\n"));
    setIncludeDomainsText(parsed.include_domains.join("\n"));
    setSeedUrlsText(parsed.seed_urls.join("\n"));
  }, [initialFiltersJson]);

  const selectedCount = useMemo(
    () =>
      SOURCE_TYPE_OPTIONS.filter((option) => !filters.exclude_source_types.includes(option.key))
        .length,
    [filters.exclude_source_types],
  );

  function toggleSourceTypeActive(sourceType: string, isActive: boolean) {
    setFilters((prev) => {
      const exists = prev.exclude_source_types.includes(sourceType);
      let exclude_source_types = prev.exclude_source_types;
      if (isActive && exists) {
        exclude_source_types = prev.exclude_source_types.filter((item) => item !== sourceType);
      } else if (!isActive && !exists) {
        exclude_source_types = [...prev.exclude_source_types, sourceType];
      }
      return { ...prev, exclude_source_types };
    });
  }

  function applyStartupPreset() {
    setFilters((prev) => ({
      ...prev,
      exclude_source_types: STARTUP_PRESET_EXCLUSIONS,
    }));
  }

  function clearAll() {
    setFilters({
      exclude_source_types: [],
      exclude_domains: [],
      include_domains: [],
      seed_urls: [],
    });
    setExcludeDomainsText("");
    setIncludeDomainsText("");
    setSeedUrlsText("");
  }

  async function saveFilters() {
    setSaving(true);
    try {
      const payload: PublicSourceFilters = {
        exclude_source_types: Array.from(
          new Set(
            filters.exclude_source_types
              .map((item) => String(item || "").trim().toLowerCase())
              .filter((item) => Boolean(item) && item !== "public_web"),
          ),
        ),
        exclude_domains: parseDomains(excludeDomainsText),
        include_domains: parseDomains(includeDomainsText),
        seed_urls: parseSeedUrls(seedUrlsText),
      };

      const { error } = await (supabase as any)
        .from("companies")
        .update({ public_source_filters_json: payload })
        .eq("id", companyId);

      if (error) throw error;

      setFilters(payload);
      setExcludeDomainsText(payload.exclude_domains.join("\n"));
      setIncludeDomainsText(payload.include_domains.join("\n"));
      setSeedUrlsText(payload.seed_urls.join("\n"));
      toast.success("Public source filters saved");
      await onSaved?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save source filters");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="bg-white border border-border rounded-2xl p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-sans text-[14px] font-semibold text-foreground">Public Source Controls</div>
          <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
            Choose which public source types/domains baseline research can use
          </div>
          <div className="mt-1 font-sans text-[12px] leading-relaxed text-muted-foreground">
            These settings apply to the next Web Baseline run for this company.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={applyStartupPreset}
            className="rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide transition-colors"
          >
            Startup Preset
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide transition-colors"
          >
            Enable All
          </button>
          <button
            type="button"
            onClick={saveFilters}
            disabled={saving}
            className="rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide transition-colors disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-border bg-muted/10 p-3">
        <div className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          Active Source Types ({selectedCount}/{SOURCE_TYPE_OPTIONS.length})
        </div>
        <div className="mt-1 font-sans text-[12px] leading-relaxed text-muted-foreground">
          Checked = active source. Unchecked = excluded from evidence collection.
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {SOURCE_TYPE_OPTIONS.map((option) => {
            const checked = !filters.exclude_source_types.includes(option.key);
            return (
              <label key={option.key} className="flex items-start gap-2 rounded-md border border-border bg-white px-2.5 py-2">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={checked}
                  onChange={(event) => toggleSourceTypeActive(option.key, event.target.checked)}
                />
                <span className="font-sans text-[12px] leading-relaxed text-foreground">{option.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="block">
          <div className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">Exclude Domains (Blacklist)</div>
          <textarea
            value={excludeDomainsText}
            onChange={(event) => setExcludeDomainsText(event.target.value)}
            placeholder={"reddit.com\nquora.com"}
            rows={5}
            className="mt-1 w-full rounded-md border border-border bg-white px-2.5 py-2 font-sans text-[12px] text-foreground"
          />
        </label>
        <label className="block">
          <div className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">Include Domains (Whitelist)</div>
          <textarea
            value={includeDomainsText}
            onChange={(event) => setIncludeDomainsText(event.target.value)}
            placeholder={"yourcompany.com\nexamplepartner.com"}
            rows={5}
            className="mt-1 w-full rounded-md border border-border bg-white px-2.5 py-2 font-sans text-[12px] text-foreground"
          />
        </label>
        <label className="block">
          <div className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">Manual Public URLs (Seed)</div>
          <textarea
            value={seedUrlsText}
            onChange={(event) => setSeedUrlsText(event.target.value)}
            placeholder={"https://www.linkedin.com/company/whispering-ai/\nhttps://x.com/WhisperingAI"}
            rows={5}
            className="mt-1 w-full rounded-md border border-border bg-white px-2.5 py-2 font-sans text-[12px] text-foreground"
          />
          <div className="mt-1 font-sans text-[11px] text-muted-foreground">
            Used even when search engines return no hits.
          </div>
        </label>
      </div>
    </section>
  );
}

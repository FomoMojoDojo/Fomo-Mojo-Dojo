// supabase/functions/public-baseline/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function addMinutesIso(minutes: number) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

async function acquireCompanyRunLock(args: {
  supabase: ReturnType<typeof createClient>;
  companyId: string;
  userId: string;
  operation: string;
  ttlMinutes?: number;
}) {
  const ttlMinutes = args.ttlMinutes ?? 30;

  await args.supabase
    .from("company_run_locks")
    .delete()
    .eq("company_id", args.companyId)
    .lt("expires_at", new Date().toISOString());

  const { error } = await args.supabase
    .from("company_run_locks")
    .insert({
      company_id: args.companyId,
      operation: args.operation,
      started_by: args.userId,
      expires_at: addMinutesIso(ttlMinutes),
    });

  if (!error) return null;

  const { data: existing } = await args.supabase
    .from("company_run_locks")
    .select("operation, started_at, expires_at")
    .eq("company_id", args.companyId)
    .maybeSingle();

  return { error, existing };
}

async function releaseCompanyRunLock(supabase: ReturnType<typeof createClient>, companyId: string) {
  const { error } = await supabase.from("company_run_locks").delete().eq("company_id", companyId);
  if (error) {
    console.log("[baseline] lock release error", error.message);
  }
}

function startCompanyRunLockHeartbeat(args: {
  supabase: ReturnType<typeof createClient>;
  companyId: string;
  ttlMinutes: number;
  intervalMs?: number;
}) {
  const intervalMs = args.intervalMs ?? 5 * 60_000;

  const timer = setInterval(async () => {
    const { error } = await args.supabase
      .from("company_run_locks")
      .update({ expires_at: addMinutesIso(args.ttlMinutes) })
      .eq("company_id", args.companyId);

    if (error) {
      console.log("[baseline] lock heartbeat error", error.message);
    }
  }, intervalMs);

  return () => clearInterval(timer);
}

function extractTextBasic(html: string): string {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|br|li|h1|h2|h3|h4|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal, redirect: "follow" });
  } finally {
    clearTimeout(t);
  }
}

function getDomain(rawUrl: string): string {
  try {
    return new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`)
      .hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function domainStem(domain: string): string {
  const d = (domain || "").replace(/^www\./, "");
  return d.split(".")[0] || "";
}

function normalizeText(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenSet(s: string): Set<string> {
  return new Set(
    normalizeText(s)
      .split(" ")
      .filter((t) => t.length >= 3),
  );
}

function splitCamelCase(name: string): string {
  return (name || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function buildNameVariants(companyName: string, website: string): string[] {
  const d = getDomain(website);
  const stem = domainStem(d);

  const v1 = (companyName || "").trim();
  const v2 = splitCamelCase(v1);
  const v3 = stem ? stem : "";
  const v4 = stem ? splitCamelCase(stem) : "";

  const variants = [v1, v2, v3, v4]
    .map((x) => (x || "").trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of variants) {
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

const GENERIC_TOKENS = new Set([
  "inc",
  "llc",
  "ltd",
  "co",
  "company",
  "corp",
  "corporation",
  "group",
  "labs",
  "lab",
  "systems",
  "system",
  "platform",
  "solutions",
  "solution",
  "services",
  "service",
  "technologies",
  "technology",
  "the",
  "and",
  "for",
]);

/**
 * Soft-match scoring:
 * - We keep ALL search results, but assign match_score + match_reason.
 * - We then pick evidence candidates from best matches.
 */
function scoreCompanyMatch(args: {
  companyName: string;
  website: string;
  url: string;
  title?: string;
  snippet?: string;
}) {
  const { companyName, website, url, title = "", snippet = "" } = args;

  const domain = getDomain(website);
  const stem = domainStem(domain);
  const u = (url || "").toLowerCase();
  const hay = normalizeText(`${title} ${snippet}`);

  const reasons: string[] = [];
  let score = 0;

  // 1) Domain match is strongest
  if (domain && u.includes(domain)) {
    score += 90;
    reasons.push("domain_match");
  }

  // 2) Domain stem match (fomomojodojo)
  if (stem && (u.includes(stem) || hay.includes(stem))) {
    score += 20;
    reasons.push("domain_stem");
  }

  // 3) Company name token overlap
  const variants = buildNameVariants(companyName, website);
  const nameTokens = new Set<string>();
  for (const v of variants) for (const t of tokenSet(v)) nameTokens.add(t);
  for (const g of GENERIC_TOKENS) nameTokens.delete(g);

  let hits = 0;
  let longHit = false;
  for (const t of nameTokens) {
    if (hay.includes(t)) {
      hits++;
      if (t.length >= 5) longHit = true;
    }
  }

  if (hits >= 3) {
    score += 40;
    reasons.push("name_tokens_strong");
  } else if (hits === 2) {
    score += 25;
    reasons.push("name_tokens_medium");
  } else if (hits === 1) {
    score += 10;
    reasons.push("name_tokens_weak");
  }

  // Slight confidence bump if we hit at least one longer token
  if (longHit) {
    score += 5;
    reasons.push("rare_token");
  }

  if (nameTokens.size === 0) reasons.push("no_name_tokens");

  score = Math.min(100, score);
  return { score, reasons, variants, domain, stem };
}

async function searxSearch(searxUrl: string, query: string, count: number) {
  console.log("[baseline] starting search", { searxUrl, query, count });

  const u = new URL("/search", searxUrl);
  u.searchParams.set("q", query);
  u.searchParams.set("format", "json");
  u.searchParams.set("language", "en");
  u.searchParams.set("safesearch", "0");

  const resp = await fetchWithTimeout(u.toString(), 20_000);
  if (!resp.ok) throw new Error(`SearxNG error ${resp.status}`);

  const data = await resp.json();
  const results = Array.isArray(data?.results) ? data.results : [];

  const seen = new Set<string>();
  const out: any[] = [];
  for (const r of results) {
    const url = r?.url;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({
      url,
      title: r?.title ?? "",
      snippet: r?.content ?? "",
      engine: r?.engine ?? "",
    });
    if (out.length >= count) break;
  }

  console.log("[baseline] search results", {
    rawCount: results.length,
    outCount: out.length,
    first: out[0]?.url ?? null,
  });

  return out;
}

async function fetchAndExtract(url: string) {
  try {
    const resp = await fetchWithTimeout(url, 20_000);
    const ct = resp.headers.get("content-type") || "";
    if (!resp.ok) return { url, ok: false, status: resp.status, text: "" };

    if (ct.includes("application/pdf")) return { url, ok: false, status: 415, text: "" };

    const html = await resp.text();
    const text = extractTextBasic(html);
    const capped = text.slice(0, 12_000);
    return { url, ok: true, status: 200, text: capped };
  } catch {
    return { url, ok: false, status: 0, text: "" };
  }
}

function inferSourceType(url: string, title = "", snippet = ""): string {
  const host = getDomain(url);
  const text = `${title} ${snippet}`.toLowerCase();

  if (/(glassdoor|indeed)\./.test(host)) return "employee_review";
  if (/(g2|capterra|trustpilot|yelp)\./.test(host)) return "customer_review";
  if (/(reddit|quora)\./.test(host)) return "community_discussion";
  if (/(linkedin)\./.test(host)) return "profile_or_company_page";
  if (/(crunchbase|pitchbook|zoominfo|guidestar|charitynavigator)\./.test(host)) return "third_party_profile";
  if (text.includes("review") || text.includes("rating")) return "review_signal";
  if (text.includes("news") || text.includes("press")) return "news_signal";
  return "public_web";
}

function extractResponsesOutputText(data: any): string | null {
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text;

  const msg = Array.isArray(data?.output)
    ? data.output.find((o: any) => o?.type === "message" && Array.isArray(o?.content))
    : null;

  const outText =
    msg?.content?.find((c: any) => c?.type === "output_text" && typeof c?.text === "string")?.text ?? null;

  if (typeof outText === "string" && outText.trim()) return outText;
  return null;
}

async function callOpenAI(opts: {
  apiKey: string;
  model: string;
  companyName: string;
  companyUrl: string;
  evidence: { url: string; title: string; snippet: string; extracted: string; source_type?: string }[];
}) {
  const { apiKey, model, companyName, companyUrl, evidence } = opts;

  console.log("[baseline] calling openai", { model, evidenceCount: evidence.length });

  const format = {
    type: "json_schema",
    name: "public_baseline",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        category_archetype: { type: "string" },
        lens_card: {
          type: "object",
          additionalProperties: false,
          properties: {
            primary_buyer: { type: "string" },
            chooser: { type: "string" },
            user: { type: "string" },
            switching_costs: { type: "string" },
            adoption_constraints: { type: "string" },
            value_chain: { type: "string" },
            risk_surface: { type: "string" },
            economic_engine: { type: "string" },
          },
          required: [
            "primary_buyer",
            "chooser",
            "user",
            "switching_costs",
            "adoption_constraints",
            "value_chain",
            "risk_surface",
            "economic_engine",
          ],
        },
        evidence_ledger: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              url: { type: "string" },
              source_type: { type: "string" },
              date: { type: "string" },
              snippet: { type: "string" },
              bucket: { type: "string" },
              signal_strength: { type: "string" },
              confidence: { type: "integer" },
            },
            required: ["url", "source_type", "date", "snippet", "bucket", "signal_strength", "confidence"],
          },
        },
        top_hypotheses: { type: "array", items: { type: "string" } },
        open_questions: { type: "array", items: { type: "string" } },
        market_initiative_success: {
          type: "object",
          additionalProperties: false,
          properties: {
            proven: { type: "boolean" },
            low_pct: { type: "integer" },
            typical_pct: { type: "integer" },
            high_pct: { type: "integer" },
            source: { type: "string" },
            as_of: { type: "string" },
            confidence: { type: "integer" },
            evidence_urls: {
              type: "array",
              items: { type: "string" },
            },
            evidence_snippets: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: [
            "proven",
            "low_pct",
            "typical_pct",
            "high_pct",
            "source",
            "as_of",
            "confidence",
            "evidence_urls",
            "evidence_snippets",
          ],
        },
        message_alignment: {
          type: "object",
          additionalProperties: false,
          properties: {
            company_claim_posture: { type: "string" },
            outside_voice_posture: { type: "string" },
            alignment_status: { type: "string" },
            alignment_summary: { type: "string" },
          },
          required: ["company_claim_posture", "outside_voice_posture", "alignment_status", "alignment_summary"],
        },
        outside_voice_signals: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              perspective: { type: "string" },
              source_type: { type: "string" },
              signal: { type: "string" },
              sentiment: { type: "string" },
              alignment: { type: "string" },
              url: { type: "string" },
              confidence: { type: "integer" },
            },
            required: ["perspective", "source_type", "signal", "sentiment", "alignment", "url", "confidence"],
          },
        },
      },
      required: [
        "category_archetype",
        "lens_card",
        "evidence_ledger",
        "top_hypotheses",
        "open_questions",
        "market_initiative_success",
        "message_alignment",
        "outside_voice_signals",
      ],
    },
  };

  const body = {
    model,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text:
              "You are an outside-in strategy analyst. Use ONLY the evidence provided. " +
              "Do not assume private info. If uncertain, say unknown. " +
              "If evidence appears to describe a different company, note it as ambiguous in open_questions. " +
              "For market initiative success rates, only mark proven=true when explicit numeric market data appears in the evidence. " +
              "If not proven, use low_pct=0, typical_pct=12, high_pct=20 and source='unproven'. " +
              "When proven=true, include source name plus evidence_urls and short evidence_snippets that support the numbers. " +
              "Use clear, plain language. Avoid consulting jargon, business cliches, and buzzwords unless the source evidence explicitly uses those terms. " +
              "If the evidence includes direct quotes, preserve them verbatim. " +
              "If clearer wording is helpful, keep the original wording and add a separate optional line starting with 'Suggested clearer version:'.",
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              `Company: ${companyName}\nWebsite: ${companyUrl}\n\n` +
              `TASK: Build a public baseline from provided evidence.\n` +
              `- Infer category archetype\n- Produce a lens card\n- Build an evidence ledger tied to buckets/signals\n- Compare company claims against employee/customer/market signals when outside sources exist\n- Provide top hypotheses + open questions\n\n` +
              `Use only evidence. If unknown, say unknown.\n` +
              `Treat review, community, employee, news, and profile sources as outside voices rather than company claims.\n`,
          },
          { type: "input_text", text: JSON.stringify({ evidence }) },
        ],
      },
    ],
    text: { format },
  };

  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`OpenAI error ${resp.status}: ${errText}`);
  }

  const data = await resp.json();
  const text = extractResponsesOutputText(data);
  if (!text) throw new Error("OpenAI response missing output_text");

  return JSON.parse(text);
}

function buildInsufficientResult(args: {
  companyName: string;
  website: string;
  domain: string;
  variants: string[];
  reason: string;
  debug: Record<string, any>;
}) {
  const { companyName, website, domain, variants, reason, debug } = args;

  return {
    status: "insufficient_public_evidence",
    reason,
    company: { name: companyName, website, domain, variants },
    debug,
    category_archetype: "unknown",
    lens_card: {
      primary_buyer: "unknown",
      chooser: "unknown",
      user: "unknown",
      switching_costs: "unknown",
      adoption_constraints: "unknown",
      value_chain: "unknown",
      risk_surface: "unknown",
      economic_engine: "unknown",
    },
    evidence_ledger: [],
    top_hypotheses: [],
    open_questions: [
      "Not enough public sources to establish a baseline. Add more sources (press, docs, profiles) or upload internal docs.",
    ],
    market_initiative_success: {
      proven: false,
      low_pct: 0,
      typical_pct: 12,
      high_pct: 20,
      source: "unproven",
      as_of: "unknown",
      confidence: 0,
      evidence_urls: [],
      evidence_snippets: [],
    },
    message_alignment: {
      company_claim_posture: "unknown",
      outside_voice_posture: "unknown",
      alignment_status: "unknown",
      alignment_summary: "No reliable outside-voice evidence was available to compare company claims against the market.",
    },
    outside_voice_signals: [],
  };
}

function buildAmbiguousResult(args: {
  companyName: string;
  website: string;
  domain: string;
  variants: string[];
  reason: string;
  debug: Record<string, any>;
  closest_sources: any[];
}) {
  const { companyName, website, domain, variants, reason, debug, closest_sources } = args;

  return {
    status: "ambiguous_public_evidence",
    reason,
    company: { name: companyName, website, domain, variants },
    debug,
    closest_sources,
    category_archetype: "unknown",
    lens_card: {
      primary_buyer: "unknown",
      chooser: "unknown",
      user: "unknown",
      switching_costs: "unknown",
      adoption_constraints: "unknown",
      value_chain: "unknown",
      risk_surface: "unknown",
      economic_engine: "unknown",
    },
    evidence_ledger: [],
    top_hypotheses: [],
    open_questions: [
      "Search results look like they may refer to a different company. Review closest_sources and adjust name/domain if needed.",
      "If this company has a small footprint, add a LinkedIn page, press mention, or upload internal docs for baseline.",
    ],
    market_initiative_success: {
      proven: false,
      low_pct: 0,
      typical_pct: 12,
      high_pct: 20,
      source: "unproven",
      as_of: "unknown",
      confidence: 0,
      evidence_urls: [],
      evidence_snippets: [],
    },
    message_alignment: {
      company_claim_posture: "unknown",
      outside_voice_posture: "ambiguous",
      alignment_status: "ambiguous",
      alignment_summary: "Outside-voice evidence is too ambiguous to compare against the company's narrative with confidence.",
    },
    outside_voice_signals: [],
  };
}

function withRunLedger(
  result: Record<string, unknown>,
  ledger: Record<string, unknown>,
) {
  return {
    ...result,
    run_ledger: {
      ...(typeof result?.run_ledger === "object" && result?.run_ledger !== null
        ? (result.run_ledger as Record<string, unknown>)
        : {}),
      ...ledger,
    },
  };
}

Deno.serve(async (req) => {
  console.log(`[baseline] HIT method=${req.method} url=${req.url}`);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    const searxUrl = Deno.env.get("SEARXNG_URL") || "http://host.docker.internal:8888";
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const openaiModel = Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini";
    const runLedger = {
      provider: "openai_public",
      model: openaiModel,
      endpoint: "https://api.openai.com/v1/responses",
      path: "public_web_research",
      local_only: false,
      generated_at: new Date().toISOString(),
    };

    console.log(
      `[baseline] env supabaseUrl=${!!supabaseUrl} serviceRole=${!!serviceRoleKey} anonKey=${!!anonKey} searxUrl=${searxUrl} openaiKey=${!!openaiKey} model=${openaiModel}`,
    );

    if (!supabaseUrl || !serviceRoleKey || !anonKey) return json({ error: "Missing Supabase env vars" }, 500);
    if (!openaiKey) return json({ error: "Missing OPENAI_API_KEY" }, 500);

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "No auth header" }, 401);

    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userRes, error: authError } = await anonClient.auth.getUser();
    if (authError || !userRes?.user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const company_id = body?.company_id;
    const company_name = body?.company_name;
    const website = body?.website ?? "";

    if (!company_id || !company_name || !website) {
      return json({ error: "company_id, company_name, website required" }, 400);
    }

    const lockTtlMinutes = 30;
    const lockResult = await acquireCompanyRunLock({
      supabase,
      companyId: company_id,
      userId: userRes.user.id,
      operation: "baseline",
      ttlMinutes: lockTtlMinutes,
    });

    if (lockResult) {
      return json({
        error: "Another run is already in progress for this company",
        status: "company_locked",
        operation: lockResult.existing?.operation ?? "unknown",
        started_at: lockResult.existing?.started_at ?? null,
        expires_at: lockResult.existing?.expires_at ?? null,
      }, 409);
    }

    const stopLockHeartbeat = startCompanyRunLockHeartbeat({
      supabase,
      companyId: company_id,
      ttlMinutes: lockTtlMinutes,
    });

    try {
    const domain = getDomain(website);
    const stem = domainStem(domain);
    const variants = buildNameVariants(company_name, website);
    const spaced = splitCamelCase(company_name);
    const quoted = `"${company_name}"`;

    // Search passes (general-purpose + works for many companies)
    const queryA =
      `${quoted} (site:${domain} OR "${domain}" OR "${stem}") ` +
      `("about" OR "company" OR "press" OR "investor" OR "careers")`;

    const queryB =
      `"${spaced}" "${domain}" (company OR product OR services OR platform) ` +
      `(competitors OR pricing OR reviews OR news OR investors)`;

    const queryC =
      `${domain} ${variants.join(" OR ")} (about OR company OR pricing OR reviews OR news)`;
    const queryD =
      `"${spaced}" "${domain}" (glassdoor OR indeed OR g2 OR capterra OR trustpilot OR reddit OR forum OR complaints)`;
    const queryE =
      `${quoted} "${domain}" (customer reviews OR employee reviews OR testimonials OR ratings OR reddit OR community OR nonprofit)`;

    const mergeUnique = (a: any[], b: any[]) => {
      const seen = new Set<string>();
      const out: any[] = [];
      for (const r of [...a, ...b]) {
        if (!r?.url || seen.has(r.url)) continue;
        seen.add(r.url);
        out.push(r);
      }
      return out;
    };

    const sourcesA = await searxSearch(searxUrl, queryA, 20);
    const sourcesB = await searxSearch(searxUrl, queryB, 20);
    const sourcesC = await searxSearch(searxUrl, queryC, 20);
    const sourcesD = await searxSearch(searxUrl, queryD, 16);
    const sourcesE = await searxSearch(searxUrl, queryE, 16);

    const rawSources = mergeUnique(
      mergeUnique(mergeUnique(sourcesA, sourcesB), mergeUnique(sourcesC, sourcesD)),
      sourcesE,
    );

    // Annotate ALL sources with soft match scores (keep even if wrong — useful for review)
    const annotated = rawSources
      .map((r: any) => {
        const m = scoreCompanyMatch({
          companyName: company_name,
          website,
          url: r?.url,
          title: r?.title,
          snippet: r?.snippet,
        });
        return {
          ...r,
          source_type: inferSourceType(r?.url, r?.title, r?.snippet),
          match_score: m.score,
          match_reason: m.reasons,
        };
      })
      .sort((a: any, b: any) => (b.match_score ?? 0) - (a.match_score ?? 0));

    const strong = annotated.filter((x: any) => (x.match_score ?? 0) >= 80);
    const medium = annotated.filter((x: any) => (x.match_score ?? 0) >= 50 && (x.match_score ?? 0) < 80);

    // Candidates: best matches first. If nothing strong, we still keep a few “closest” for an ambiguous run.
    const candidates =
      strong.length ? strong.slice(0, 12) :
      medium.length ? medium.slice(0, 10) :
      annotated.slice(0, 6);

    // Always attempt direct website fetch (helps tiny footprints)
    const directUrl = website.startsWith("http") ? website : `https://${website}`;
    const direct = await fetchAndExtract(directUrl);
    const directEvidence =
      direct.ok && direct.text && direct.text.length > 500
        ? [{ url: directUrl, title: company_name, snippet: "Direct website fetch", extracted: direct.text }]
        : [];

    console.log("[baseline] source scoring", {
      domain,
      variants,
      rawCount: rawSources.length,
      annotatedCount: annotated.length,
      top1: annotated[0]?.url ?? null,
      top1Score: annotated[0]?.match_score ?? null,
      strong: strong.length,
      medium: medium.length,
      candidates: candidates.length,
      directOk: direct.ok,
      directLen: direct.text?.length ?? 0,
    });

    // If nothing at all and no direct evidence -> insufficient (200, not 500)
    if (annotated.length === 0 && directEvidence.length === 0) {
      const resultJson = buildInsufficientResult({
        companyName: company_name,
        website,
        domain,
        variants,
        reason: "No public sources returned by search; direct website fetch also failed or too thin.",
        debug: {
          queryA,
          queryB,
          queryC,
          queryD,
          queryE,
          rawA: sourcesA.length,
          rawB: sourcesB.length,
          rawC: sourcesC.length,
          rawD: sourcesD.length,
          rawE: sourcesE.length,
          directOk: direct.ok,
        },
      });

      const { data: inserted, error: insErr } = await supabase
        .from("public_baseline_runs")
        .insert({
          company_id,
          company_name,
          website,
          sources_json: { note: "no-results", queryA, queryB, queryC, queryD, queryE, raw_sources: rawSources },
          result_json: withRunLedger(resultJson, runLedger),
        })
        .select("id")
        .single();

      if (insErr) return json({ error: "DB insert failed", details: insErr }, 500);

      return json({
        message: "Public baseline: insufficient public evidence",
        status: "insufficient_public_evidence",
        run_id: inserted?.id,
      });
    }

    // If there are results but none match well (and no direct site), record ambiguous (200) and include closest sources
    if (strong.length === 0 && medium.length === 0 && directEvidence.length === 0) {
      const closest = annotated.slice(0, 10).map((x: any) => ({
        url: x.url,
        title: x.title,
        snippet: x.snippet,
        engine: x.engine,
        match_score: x.match_score,
        match_reason: x.match_reason,
      }));

      const resultJson = buildAmbiguousResult({
        companyName: company_name,
        website,
        domain,
        variants,
        reason: "Search results did not strongly match provided company/domain.",
        debug: { queryA, queryB, queryC, queryD, queryE, rawCount: rawSources.length, strong: strong.length, medium: medium.length },
        closest_sources: closest,
      });

      const { data: inserted, error: insErr } = await supabase
        .from("public_baseline_runs")
        .insert({
          company_id,
          company_name,
          website,
          sources_json: { note: "ambiguous", queryA, queryB, queryC, queryD, queryE, annotated_top: closest },
          result_json: withRunLedger(resultJson, runLedger),
        })
        .select("id")
        .single();

      if (insErr) return json({ error: "DB insert failed", details: insErr }, 500);

      return json({
        message: "Public baseline: ambiguous evidence (possible different company)",
        status: "ambiguous_public_evidence",
        run_id: inserted?.id,
      });
    }

    // Fetch & extract only candidates (faster + avoids trash)
    const extracted: any[] = [];
    for (const s of candidates) {
      const got = await fetchAndExtract(s.url);
      extracted.push({
        url: s.url,
        title: s.title,
        snippet: s.snippet,
        engine: s.engine,
        source_type: s.source_type,
        match_score: s.match_score,
        match_reason: s.match_reason,
        extracted: got.ok ? got.text : "",
        ok: got.ok,
      });
    }

    const evidenceFromSearch = extracted
      .filter((e) => e.ok && e.extracted && e.extracted.length > 500)
      .slice(0, 12)
      .map((e) => ({
        url: e.url,
        title: e.title,
        snippet: e.snippet,
        source_type: e.source_type,
        extracted: e.extracted,
      }));

    // Combine (direct first so it’s always included)
    const evidence = [...directEvidence, ...evidenceFromSearch].slice(0, 12);

    console.log("[baseline] evidence ready", {
      evidenceCount: evidence.length,
      fromDirect: directEvidence.length,
      fromSearchOk: evidenceFromSearch.length,
      candidateCount: candidates.length,
    });

    // If evidence is too thin, record insufficient (200) and include top sources for debugging
    if (evidence.length < 2) {
      const closest = annotated.slice(0, 10).map((x: any) => ({
        url: x.url,
        title: x.title,
        snippet: x.snippet,
        engine: x.engine,
        match_score: x.match_score,
        match_reason: x.match_reason,
      }));

      const resultJson = buildInsufficientResult({
        companyName: company_name,
        website,
        domain,
        variants,
        reason: "Not enough extractable evidence (need at least 2 sources with meaningful text).",
        debug: {
          filteredStrong: strong.length,
          filteredMedium: medium.length,
          candidates: candidates.length,
          extractedOk: evidenceFromSearch.length,
          directIncluded: directEvidence.length,
          closest_sources: closest,
        },
      });

      const { data: inserted, error: insErr } = await supabase
        .from("public_baseline_runs")
        .insert({
          company_id,
          company_name,
          website,
          sources_json: {
            note: "thin-evidence",
            queryA,
            queryB,
            queryC,
            queryD,
            queryE,
            annotated_top: closest,
            extracted_meta: extracted.map((x) => ({
              url: x.url,
              ok: x.ok,
              len: (x.extracted || "").length,
              match_score: x.match_score,
              source_type: x.source_type,
            })),
          },
          result_json: withRunLedger(resultJson, runLedger),
        })
        .select("id")
        .single();

      if (insErr) return json({ error: "DB insert failed", details: insErr }, 500);

      return json({
        message: "Public baseline: insufficient public evidence",
        status: "insufficient_public_evidence",
        run_id: inserted?.id,
      });
    }

    // Normal: OpenAI baseline
    const result = await callOpenAI({
      apiKey: openaiKey,
      model: openaiModel,
      companyName: company_name,
      companyUrl: website,
      evidence,
    });

    const { data: inserted, error: insErr } = await supabase
      .from("public_baseline_runs")
      .insert({
        company_id,
        company_name,
        website,
        // Save full annotated sources for later review (includes “wrong company” candidates like CiboGlobal)
        sources_json: { queries: { queryA, queryB, queryC, queryD, queryE }, annotated_sources: annotated.slice(0, 60) },
        result_json: withRunLedger(
          typeof result === "object" && result !== null
            ? (result as Record<string, unknown>)
            : {},
          runLedger,
        ),
      })
      .select("id")
      .single();

    if (insErr) return json({ error: "DB insert failed", details: insErr }, 500);

    console.log("[baseline] DONE", { run_id: inserted?.id, sources: annotated.length });

    return json({
      message: "Public baseline complete",
      status: "ok",
      run_id: inserted?.id,
      sources: annotated.length,
      strong_matches: strong.length,
      medium_matches: medium.length,
    });
    } finally {
      stopLockHeartbeat();
      await releaseCompanyRunLock(supabase, company_id);
    }
  } catch (err) {
    console.error("[baseline] error:", err);
    return json({ error: String((err as any)?.message || err) }, 500);
  }
});

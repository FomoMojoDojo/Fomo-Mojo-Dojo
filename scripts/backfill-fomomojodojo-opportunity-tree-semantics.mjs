#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_COMPANY_ID = "9d454e40-333f-4dc6-aa6e-dae6fca32758";
const REQUIRED_FRAMEWORK_KEYS = ["odi", "teresa_torres"];

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "into", "from", "that", "this", "your", "their", "while", "through", "across",
  "customer", "customers", "partner", "partners", "team", "teams", "step", "journey", "outcome", "outcomes", "opportunity", "opportunities",
  "increase", "reduce", "improve", "maximize", "minimize", "avoid",
]);

function readEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

function parseArgs(argv) {
  const args = {
    companyId: DEFAULT_COMPANY_ID,
    apply: false,
    dryRun: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--company-id" && argv[i + 1]) {
      args.companyId = String(argv[i + 1]).trim();
      i += 1;
      continue;
    }
    if (token === "--apply") {
      args.apply = true;
      args.dryRun = false;
      continue;
    }
    if (token === "--dry-run") {
      args.dryRun = true;
      args.apply = false;
    }
  }

  return args;
}

function normalizeFrameworkKeys(value) {
  const source = Array.isArray(value) ? value : [];
  const aliases = {
    odi: "odi",
    jtbd: "odi",
    "jobs-to-be-done": "odi",
    teresa_torres: "teresa_torres",
    "teresa torres": "teresa_torres",
    "teresa torres opportunity mapping": "teresa_torres",
  };
  return Array.from(
    new Set(
      source
        .map((item) => String(item || "").trim().toLowerCase())
        .map((item) => aliases[item] || item)
        .filter(Boolean),
    ),
  );
}

function ensureRequiredFrameworkKeys(value) {
  return Array.from(new Set([...normalizeFrameworkKeys(value), ...REQUIRED_FRAMEWORK_KEYS]));
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  const tokens = String(value || "").toLowerCase().match(/[a-z][a-z-]{2,}/g) || [];
  return tokens.filter((token) => !STOP_WORDS.has(token));
}

function jaccardSimilarity(a, b) {
  const aSet = new Set(tokenize(a));
  const bSet = new Set(tokenize(b));
  if (aSet.size === 0 || bSet.size === 0) return 0;
  let intersection = 0;
  for (const token of aSet) {
    if (bSet.has(token)) intersection += 1;
  }
  const union = new Set([...aSet, ...bSet]).size;
  return union > 0 ? intersection / union : 0;
}

function overlapRatio(aSet, bSet) {
  if (aSet.size === 0 || bSet.size === 0) return 0;
  let intersection = 0;
  for (const token of aSet) {
    if (bSet.has(token)) intersection += 1;
  }
  return intersection / Math.min(aSet.size, bSet.size);
}

function isNearDuplicate(desiredOutcome, opportunityOutcome) {
  const desired = normalizeText(desiredOutcome);
  const opportunity = normalizeText(opportunityOutcome);
  if (!desired || !opportunity) return false;
  if (desired === opportunity) return true;
  if (desired.length >= 24 && opportunity.length >= 24 && (desired.includes(opportunity) || opportunity.includes(desired))) {
    return true;
  }
  if (jaccardSimilarity(desired, opportunity) >= 0.72) return true;

  const desiredTokens = new Set(tokenize(desired));
  const opportunityTokens = new Set(tokenize(opportunity));
  if (Math.min(desiredTokens.size, opportunityTokens.size) >= 4 && overlapRatio(desiredTokens, opportunityTokens) >= 0.86) {
    return true;
  }
  return false;
}

function solutionMatchTokens(value) {
  const tokens = String(value || "").toLowerCase().match(/[a-z][a-z-]{2,}/g) || [];
  return tokens.filter((token) => !STOP_WORDS.has(token));
}

function routeOpportunityFitScore(route, opportunity) {
  const routeText = `${String(route?.title || "")} ${String(route?.short_description || "")} ${(Array.isArray(route?.frameworks_used) ? route.frameworks_used : []).join(" ")}`;
  const routeTokens = new Set(solutionMatchTokens(routeText));
  const oppTokens = new Set(solutionMatchTokens(`${String(opportunity?.outcome || "")} ${String(opportunity?.step_label || "")}`));
  if (routeTokens.size === 0 || oppTokens.size === 0) return 0;

  let overlap = 0;
  for (const token of oppTokens) {
    if (routeTokens.has(token)) overlap += 1;
  }

  const priorityTier = String(opportunity?.priority_tier || "");
  const desiredCategory = priorityTier === "focus" ? "fix" : priorityTier === "monitor" ? "improve" : "create";
  const routeCategory = String(route?.category || "").toLowerCase();
  const categoryScore = routeCategory === desiredCategory ? 0.6 : routeCategory ? -0.2 : 0;

  return overlap * 1.1 + categoryScore;
}

function buildSolutionTestsForIdea(opportunity, ideaTitle) {
  const outcome = String(opportunity?.outcome || "").trim() || "this opportunity outcome";
  const stepLabel = String(opportunity?.step_label || "this journey step").trim().toLowerCase();
  const title = String(ideaTitle || "this idea").trim();

  return [
    {
      title: "Desirability interview test",
      method: "Interview",
      metric: `Share of target users confirming ${outcome.toLowerCase()} is a high-priority friction in ${stepLabel}`,
      success_threshold: "At least 70% of interviews confirm this is a top-3 pain point",
      timebox: "2 weeks",
    },
    {
      title: "Pilot behavior test",
      method: "Pilot",
      metric: `Completion and quality change when running ${title}`,
      success_threshold: "At least 10% improvement vs. baseline with no quality regression",
      timebox: "2 weeks",
    },
  ];
}

function managedOutcomeDistance(outcomeText, opportunityText) {
  const desiredTokens = new Set(tokenize(outcomeText));
  const oppTokens = new Set(tokenize(opportunityText));
  if (!desiredTokens.size || !oppTokens.size) return 0;
  let overlap = 0;
  for (const token of desiredTokens) {
    if (oppTokens.has(token)) overlap += 1;
  }
  const ratio = overlap / Math.max(1, desiredTokens.size);
  return ratio + jaccardSimilarity(outcomeText, opportunityText) * 0.4;
}

function inferManagedOutcomeLink(opportunity, managedOutcomes) {
  const sameJourney = managedOutcomes.filter((item) => String(item.journey_key || "") === String(opportunity.journey_key || ""));
  const pool = sameJourney.length > 0 ? sameJourney : managedOutcomes;
  if (pool.length === 0) return null;

  const ranked = pool
    .map((candidate) => {
      const statement = String(candidate.outcome_statement || candidate.outcome_title || "");
      const score = managedOutcomeDistance(statement, String(opportunity.outcome || ""));
      return { candidate, score };
    })
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.candidate?.id || null;
}

async function loadRows(supabase, companyId) {
  const [
    companyResp,
    managedResp,
    oppResp,
    routeResp,
    existingIdeasResp,
    existingTestsResp,
  ] = await Promise.all([
    supabase.from("companies").select("id,name").eq("id", companyId).maybeSingle(),
    supabase
      .from("managed_outcomes")
      .select("id,journey_key,outcome_title,outcome_statement,leading_indicator,target_direction,frameworks_used")
      .eq("company_id", companyId)
      .order("created_at", { ascending: true }),
    supabase
      .from("opportunities")
      .select("id,user_id,managed_outcome_id,journey_key,outcome,step_number,step_label,importance,satisfaction,opportunity_score,priority_tier,frameworks_used")
      .eq("company_id", companyId)
      .order("opportunity_score", { ascending: false }),
    supabase
      .from("routes")
      .select("id,user_id,title,short_description,category,effort,sort_order,frameworks_used")
      .eq("company_id", companyId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("solution_ideas")
      .select("id,opportunity_id,route_id,title")
      .eq("company_id", companyId),
    supabase
      .from("solution_tests")
      .select("id,solution_idea_id,title")
      .eq("company_id", companyId),
  ]);

  const errors = [
    companyResp.error,
    managedResp.error,
    oppResp.error,
    routeResp.error,
    existingIdeasResp.error,
    existingTestsResp.error,
  ].filter(Boolean);
  if (errors.length > 0) {
    throw new Error(errors.map((err) => err.message).join(" | "));
  }

  return {
    company: companyResp.data,
    managedOutcomes: managedResp.data || [],
    opportunities: oppResp.data || [],
    routes: routeResp.data || [],
    existingIdeas: existingIdeasResp.data || [],
    existingTests: existingTestsResp.data || [],
  };
}

async function main() {
  const cwd = process.cwd();
  readEnvFile(path.join(cwd, "supabase/functions/.env.local"));

  const args = parseArgs(process.argv.slice(2));
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Load supabase/functions/.env.local first.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    company,
    managedOutcomes,
    opportunities,
    routes,
    existingIdeas,
    existingTests,
  } = await loadRows(supabase, args.companyId);

  if (!company) {
    throw new Error(`Company not found for id ${args.companyId}`);
  }

  if (managedOutcomes.length === 0) {
    throw new Error("No managed outcomes found. Generate managed outcomes first before backfill.");
  }

  const linkDiffs = [];
  const mappedOpportunities = opportunities.map((opportunity) => {
    const newManagedOutcomeId = inferManagedOutcomeLink(opportunity, managedOutcomes);
    if (String(opportunity.managed_outcome_id || "") !== String(newManagedOutcomeId || "")) {
      linkDiffs.push({
        opportunity_id: opportunity.id,
        old_managed_outcome_id: opportunity.managed_outcome_id,
        new_managed_outcome_id: newManagedOutcomeId,
        outcome: String(opportunity.outcome || ""),
      });
    }
    return {
      ...opportunity,
      managed_outcome_id: newManagedOutcomeId,
      frameworks_used: ensureRequiredFrameworkKeys(opportunity.frameworks_used),
    };
  });

  const managedById = new Map(managedOutcomes.map((item) => [item.id, item]));
  const distinctnessViolations = [];

  for (const opportunity of mappedOpportunities) {
    const managed = managedById.get(opportunity.managed_outcome_id || "");
    const desiredText = String(managed?.outcome_statement || managed?.outcome_title || "");
    if (!desiredText) {
      distinctnessViolations.push({
        opportunity_id: opportunity.id,
        reason: "missing_parent_managed_outcome",
      });
      continue;
    }
    if (isNearDuplicate(desiredText, String(opportunity.outcome || ""))) {
      distinctnessViolations.push({
        opportunity_id: opportunity.id,
        managed_outcome_id: opportunity.managed_outcome_id,
        managed_outcome: desiredText,
        opportunity: String(opportunity.outcome || ""),
      });
    }
  }

  const generatedIdeas = [];
  const generatedTests = [];

  for (const opportunity of mappedOpportunities) {
    const ranked = routes
      .map((route) => ({ route, score: routeOpportunityFitScore(route, opportunity) }))
      .sort((a, b) => b.score - a.score);

    let selected = ranked.filter((entry) => entry.score >= 1.2).slice(0, 2);
    if (selected.length === 0 && ranked.length > 0) {
      selected = ranked.slice(0, 1);
    }

    for (let i = 0; i < selected.length; i += 1) {
      const candidate = selected[i];
      const frameworks = ensureRequiredFrameworkKeys([
        ...normalizeFrameworkKeys(candidate.route.frameworks_used),
        ...normalizeFrameworkKeys(opportunity.frameworks_used),
      ]);
      const idea = {
        company_id: args.companyId,
        user_id: String(opportunity.user_id || candidate.route.user_id || ""),
        opportunity_id: String(opportunity.id),
        route_id: String(candidate.route.id || "") || null,
        title: String(candidate.route.title || "Untitled solution idea"),
        description: String(candidate.route.short_description || "Candidate intervention for this opportunity branch."),
        category: String(candidate.route.category || "improve"),
        effort: String(candidate.route.effort || "medium"),
        confidence: Math.max(15, Math.min(90, Math.round(candidate.score * 22))),
        frameworks_used: frameworks,
        sort_order: i + 1,
      };
      generatedIdeas.push(idea);

      const ideaTests = buildSolutionTestsForIdea(opportunity, idea.title).map((test, testIndex) => ({
        company_id: args.companyId,
        user_id: idea.user_id,
        title: test.title,
        method: test.method,
        metric: test.metric,
        success_threshold: test.success_threshold,
        timebox: test.timebox,
        frameworks_used: frameworks,
        sort_order: testIndex + 1,
      }));

      generatedTests.push({ idea, tests: ideaTests });
    }
  }

  console.log(`Company: ${company.name} (${company.id})`);
  console.log(`Mode: ${args.apply ? "apply" : "dry-run"}`);
  console.log("");
  console.log("Managed outcome link diffs:", linkDiffs.length);
  for (const diff of linkDiffs.slice(0, 20)) {
    console.log(`- opp ${diff.opportunity_id}: ${diff.old_managed_outcome_id || "null"} -> ${diff.new_managed_outcome_id || "null"}`);
  }
  if (linkDiffs.length > 20) {
    console.log(`- ... ${linkDiffs.length - 20} more`);
  }

  console.log("");
  console.log("Distinctness violations after remap:", distinctnessViolations.length);
  for (const issue of distinctnessViolations.slice(0, 20)) {
    console.log(`- opp ${issue.opportunity_id}: near-duplicate or missing parent outcome`);
  }

  console.log("");
  console.log("Solution backfill diff:");
  console.log(`- existing solution ideas: ${existingIdeas.length}`);
  console.log(`- existing solution tests: ${existingTests.length}`);
  console.log(`- generated solution ideas: ${generatedIdeas.length}`);
  console.log(`- generated solution tests: ${generatedTests.reduce((sum, item) => sum + item.tests.length, 0)}`);

  if (!args.apply) {
    console.log("\nDry-run complete. Re-run with --apply to persist updates.");
    return;
  }

  if (distinctnessViolations.length > 0) {
    throw new Error("Backfill aborted: distinctness violations remain between desired outcomes and opportunities.");
  }

  for (const opp of mappedOpportunities) {
    const { error } = await supabase
      .from("opportunities")
      .update({
        managed_outcome_id: opp.managed_outcome_id,
        frameworks_used: ensureRequiredFrameworkKeys(opp.frameworks_used),
      })
      .eq("id", opp.id)
      .eq("company_id", args.companyId);
    if (error) throw new Error(`Failed to update opportunity ${opp.id}: ${error.message}`);
  }

  const deleteTestsResp = await supabase.from("solution_tests").delete().eq("company_id", args.companyId);
  if (deleteTestsResp.error) throw new Error(`Failed deleting existing solution tests: ${deleteTestsResp.error.message}`);

  const deleteIdeasResp = await supabase.from("solution_ideas").delete().eq("company_id", args.companyId);
  if (deleteIdeasResp.error) throw new Error(`Failed deleting existing solution ideas: ${deleteIdeasResp.error.message}`);

  let insertedIdeas = 0;
  let insertedTests = 0;

  for (const entry of generatedTests) {
    const { data: ideaRow, error: ideaErr } = await supabase
      .from("solution_ideas")
      .insert(entry.idea)
      .select("id")
      .single();
    if (ideaErr) throw new Error(`Failed to insert solution idea ${entry.idea.title}: ${ideaErr.message}`);
    insertedIdeas += 1;

    const solutionIdeaId = String(ideaRow?.id || "");
    const testsPayload = entry.tests.map((test) => ({
      ...test,
      solution_idea_id: solutionIdeaId,
    }));

    const testInsert = await supabase.from("solution_tests").insert(testsPayload);
    if (testInsert.error) throw new Error(`Failed to insert tests for idea ${entry.idea.title}: ${testInsert.error.message}`);
    insertedTests += testsPayload.length;
  }

  const { data: verifyRows, error: verifyErr } = await supabase
    .from("opportunities")
    .select("id,managed_outcome_id,outcome")
    .eq("company_id", args.companyId);
  if (verifyErr) throw new Error(`Failed verification query: ${verifyErr.message}`);

  const missingLinks = (verifyRows || []).filter((row) => !row.managed_outcome_id);

  console.log("\nApply complete.");
  console.log(`- opportunities updated: ${mappedOpportunities.length}`);
  console.log(`- solution ideas inserted: ${insertedIdeas}`);
  console.log(`- solution tests inserted: ${insertedTests}`);
  console.log(`- opportunities missing managed_outcome_id: ${missingLinks.length}`);

  if (missingLinks.length > 0) {
    throw new Error("Post-apply verification failed: some opportunities are missing managed_outcome_id.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

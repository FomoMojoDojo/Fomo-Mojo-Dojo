import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';

const repoRoot = '/Users/fomomojodojo/dev/happy-file-hugger-main';
const supabaseUrl = 'http://127.0.0.1:54321';
const serviceKey = '***REMOVED***';
const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function importTsModule(relPath) {
  const absPath = path.join(repoRoot, relPath);
  const source = await fs.readFile(absPath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: absPath,
  }).outputText;
  const dataUrl = `data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`;
  return import(dataUrl);
}

const { rewriteRouteLanguage, classifyRouteQuality } = await importTsModule('src/lib/routeLanguage.ts');
const { buildConservativeRouteHypothesisLinks } = await importTsModule('src/lib/routeHypothesisLinking.ts');
const { buildRouteRationales } = await importTsModule('src/lib/routeRationale.ts');

const companyNames = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ['Cafe Barra', 'FomoMojoDojo', 'One805'];

function toCounts(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] ?? 'unknown';
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function emptySupportShape() {
  return { outside: 0, organization: 0, customer: 0 };
}

function dedupe(items) {
  return [...new Set(items.filter(Boolean))];
}

function normalizeSelectRows(rows) {
  return (rows ?? []).map((row) => ({
    ...row,
    why_this_matters_json: Array.isArray(row.why_this_matters_json) ? row.why_this_matters_json : [],
    evidence_json: Array.isArray(row.evidence_json) ? row.evidence_json : [],
    assumptions_json: Array.isArray(row.assumptions_json) ? row.assumptions_json : [],
  }));
}

async function loadCompanies() {
  const { data, error } = await supabase.from('companies').select('id,name').in('name', companyNames);
  if (error) throw error;
  return data ?? [];
}

async function loadRoutes(companyId) {
  const primary = await supabase
    .from('routes')
    .select('id,company_id,category,title,short_description,sort_order,why_this_matters_json,evidence_json,assumptions_json,dependency_state,created_at')
    .eq('company_id', companyId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (!primary.error) return normalizeSelectRows(primary.data);

  const legacy = await supabase
    .from('routes')
    .select('id,company_id,category,title,short_description,sort_order,why_this_matters_json,evidence_json,created_at')
    .eq('company_id', companyId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (legacy.error) throw legacy.error;
  return normalizeSelectRows(legacy.data);
}

async function loadHypotheses(companyId) {
  const { data, error } = await supabase
    .from('strategic_hypotheses')
    .select('id,company_id,statement,hypothesis_kind,hypothesis_state,topic,confidence,validation_state,what_must_be_true,is_active,created_at,updated_at,raw_payload,hypothesis_key,reframed_from_hypothesis_id,source_run_id')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

async function loadAllObjectDeps(companyId) {
  const { data, error } = await supabase
    .from('object_dependencies')
    .select('upstream_object_id,downstream_object_id,dependency_type,strength,upstream_object_type,downstream_object_type,company_id')
    .eq('company_id', companyId)
    .limit(2000);
  if (error) throw error;
  return data ?? [];
}

async function loadClaims(companyId, claimIds) {
  if (claimIds.length === 0) return [];
  const { data, error } = await supabase
    .from('claims')
    .select('id,company_id,statement,topic,claim_type,outside_support_count,organization_support_count,customer_support_count,triangulation_state,confidence,revalidation_flag,raw_payload,created_at,updated_at')
    .eq('company_id', companyId)
    .in('id', claimIds);
  if (error) throw error;
  return data ?? [];
}

function aggregateSupportByHypothesis(hypotheses, claimDeps, claimsById) {
  const supportShapeByHypothesis = new Map();
  const contradictionByHypothesis = new Map();
  for (const hypothesis of hypotheses) {
    supportShapeByHypothesis.set(hypothesis.id, emptySupportShape());
    contradictionByHypothesis.set(hypothesis.id, false);
  }

  for (const dep of claimDeps) {
    const claim = claimsById.get(dep.upstream_object_id);
    if (!claim) continue;
    const shape = supportShapeByHypothesis.get(dep.downstream_object_id) ?? emptySupportShape();
    if (dep.dependency_type === 'supports') {
      shape.outside += claim.outside_support_count ?? 0;
      shape.organization += claim.organization_support_count ?? 0;
      shape.customer += claim.customer_support_count ?? 0;
      supportShapeByHypothesis.set(dep.downstream_object_id, shape);
    }
    if (dep.dependency_type === 'contradicts') {
      contradictionByHypothesis.set(dep.downstream_object_id, true);
    }
  }

  return { supportShapeByHypothesis, contradictionByHypothesis };
}

function buildHypothesisCards(hypotheses, claimDeps, claimsById) {
  const depsByHypothesis = new Map();
  for (const dep of claimDeps) {
    const bucket = depsByHypothesis.get(dep.downstream_object_id) ?? [];
    bucket.push(dep);
    depsByHypothesis.set(dep.downstream_object_id, bucket);
  }

  return hypotheses.map((hypothesis) => {
    const deps = depsByHypothesis.get(hypothesis.id) ?? [];
    const toSupport = (dep) => {
      const claim = claimsById.get(dep.upstream_object_id);
      if (!claim) return null;
      return {
        claim,
        dependencyTypes: [dep.dependency_type],
        supportShape: {
          outside: claim.outside_support_count ?? 0,
          organization: claim.organization_support_count ?? 0,
          customer: claim.customer_support_count ?? 0,
        },
        contradictionCount: dep.dependency_type === 'contradicts' ? 1 : 0,
        derivedTriangulationState: claim.triangulation_state,
        strongestSupportingSignal: null,
        supportingSignals: [],
        contradictorySignals: [],
        qualifyingSignals: [],
      };
    };

    return {
      hypothesis,
      supportingClaims: deps.filter((dep) => dep.dependency_type === 'supports').map(toSupport).filter(Boolean),
      weakeningClaims: deps.filter((dep) => dep.dependency_type === 'contradicts').map(toSupport).filter(Boolean),
      latestEventAt: hypothesis.updated_at ?? hypothesis.created_at ?? null,
    };
  });
}

function linkMapByRoute(routeLinks) {
  const map = new Map();
  for (const link of routeLinks) {
    const bucket = map.get(link.downstream_object_id ?? link.routeId) ?? [];
    bucket.push(link);
    map.set(link.downstream_object_id ?? link.routeId, bucket);
  }
  return map;
}

function buildRewriteInput(route, linkedHypotheses) {
  return {
    category: route.category,
    title: route.title,
    shortDescription: route.short_description,
    whyThisMatters: route.why_this_matters_json,
    linkedHypotheses: linkedHypotheses.map((hypothesis) => ({
      statement: hypothesis.statement,
      whatMustBeTrue: hypothesis.what_must_be_true,
    })),
  };
}

function buildQualityDistribution(routes) {
  return toCounts(routes.map((route) => ({ quality: classifyRouteQuality({
    category: route.category,
    title: route.title,
    shortDescription: route.short_description,
    whyThisMatters: route.why_this_matters_json,
  }).quality })), 'quality');
}

for (const company of await loadCompanies()) {
  const routesBefore = await loadRoutes(company.id);
  const hypotheses = await loadHypotheses(company.id);
  const allDeps = await loadAllObjectDeps(company.id);
  const claimHypothesisDeps = allDeps.filter((dep) => dep.upstream_object_type === 'claim' && dep.downstream_object_type === 'strategic_hypothesis');
  const routeLinksBefore = allDeps.filter((dep) => dep.upstream_object_type === 'strategic_hypothesis' && dep.downstream_object_type === 'route');
  const claimIds = dedupe(claimHypothesisDeps.map((dep) => dep.upstream_object_id));
  const claims = await loadClaims(company.id, claimIds);
  const claimsById = new Map(claims.map((claim) => [claim.id, claim]));
  const hypothesesById = new Map(hypotheses.map((hypothesis) => [hypothesis.id, hypothesis]));
  const routeLinkMapBefore = linkMapByRoute(routeLinksBefore);
  const beforeDistribution = buildQualityDistribution(routesBefore);
  const { supportShapeByHypothesis, contradictionByHypothesis } = aggregateSupportByHypothesis(hypotheses, claimHypothesisDeps, claimsById);
  const hypothesisInputs = hypotheses.map((hypothesis) => ({
    hypothesis: {
      id: hypothesis.id,
      statement: hypothesis.statement,
      hypothesis_kind: hypothesis.hypothesis_kind,
      hypothesis_state: hypothesis.hypothesis_state,
      topic: hypothesis.topic,
      confidence: hypothesis.confidence,
      what_must_be_true: hypothesis.what_must_be_true,
      is_active: hypothesis.is_active,
    },
    supportShape: supportShapeByHypothesis.get(hypothesis.id) ?? emptySupportShape(),
    hasContradiction: contradictionByHypothesis.get(hypothesis.id) ?? false,
  }));

  const rewrittenRoutes = [];
  const rewrittenTitles = [];
  for (const route of routesBefore) {
    const linkedHypotheses = (routeLinkMapBefore.get(route.id) ?? [])
      .map((link) => hypothesesById.get(link.upstream_object_id))
      .filter(Boolean);
    const rewrite = rewriteRouteLanguage(buildRewriteInput(route, linkedHypotheses));
    const nextRoute = {
      ...route,
      title: rewrite.title,
      short_description: rewrite.shortDescription,
      why_this_matters_json: rewrite.whyThisMatters,
    };
    rewrittenRoutes.push(nextRoute);
    rewrittenTitles.push({
      routeId: route.id,
      before: route.title,
      after: rewrite.title,
      changed: rewrite.changed,
      qualityBefore: rewrite.qualityBefore.quality,
      qualityAfter: rewrite.qualityAfter.quality,
    });

    if (rewrite.changed) {
      const { error } = await supabase
        .from('routes')
        .update({
          title: rewrite.title,
          short_description: rewrite.shortDescription,
          why_this_matters_json: rewrite.whyThisMatters,
        })
        .eq('id', route.id);
      if (error) throw error;
    }
  }

  const newLinks = buildConservativeRouteHypothesisLinks({
    routes: rewrittenRoutes.map((route) => ({
      id: route.id,
      category: route.category,
      title: route.title,
      short_description: route.short_description,
      why_this_matters_json: route.why_this_matters_json,
      assumptions_json: route.assumptions_json,
    })),
    hypotheses: hypothesisInputs,
  });

  const { error: deleteError } = await supabase
    .from('object_dependencies')
    .delete()
    .eq('company_id', company.id)
    .eq('upstream_object_type', 'strategic_hypothesis')
    .eq('downstream_object_type', 'route');
  if (deleteError) throw deleteError;

  if (newLinks.length > 0) {
    const { error: insertError } = await supabase
      .from('object_dependencies')
      .insert(newLinks.map((link) => ({
        company_id: company.id,
        upstream_object_type: 'strategic_hypothesis',
        upstream_object_id: link.hypothesisId,
        downstream_object_type: 'route',
        downstream_object_id: link.routeId,
        dependency_type: link.dependencyType,
        strength: link.strength,
      })));
    if (insertError) throw insertError;
  }

  const afterDistribution = buildQualityDistribution(rewrittenRoutes);
  const routeLinksAfter = newLinks.map((link) => ({
    routeId: link.routeId,
    hypothesisId: link.hypothesisId,
    dependencyType: link.dependencyType,
    strength: link.strength,
  }));
  const hypothesisCards = buildHypothesisCards(hypotheses, claimHypothesisDeps, claimsById);

  const beforeRationales = buildRouteRationales({
    seeds: routesBefore.map((route) => ({
      route,
      evidence: Array.isArray(route.evidence_json) ? route.evidence_json : [],
      assumptions: Array.isArray(route.assumptions_json) ? route.assumptions_json : [],
    })),
    hypotheses: hypothesisCards,
    routeLinks: routeLinksBefore.map((link) => ({
      routeId: link.downstream_object_id,
      hypothesisId: link.upstream_object_id,
      dependencyType: link.dependency_type,
      strength: link.strength,
    })),
  }).sort((a, b) => b.relevanceScore - a.relevanceScore);

  const afterRationales = buildRouteRationales({
    seeds: rewrittenRoutes.map((route) => ({
      route,
      evidence: Array.isArray(route.evidence_json) ? route.evidence_json : [],
      assumptions: Array.isArray(route.assumptions_json) ? route.assumptions_json : [],
    })),
    hypotheses: hypothesisCards,
    routeLinks: routeLinksAfter,
  }).sort((a, b) => b.relevanceScore - a.relevanceScore);

  const changedRoutes = rewrittenTitles.filter((row) => row.changed);
  console.log(JSON.stringify({
    company: company.name,
    routeCount: routesBefore.length,
    beforeQuality: beforeDistribution,
    afterQuality: afterDistribution,
    hypothesisRouteDependenciesBefore: routeLinksBefore.length,
    hypothesisRouteDependenciesAfter: newLinks.length,
    graphLinkedRoutesBefore: dedupe(routeLinksBefore.map((link) => link.downstream_object_id)).length,
    graphLinkedRoutesAfter: dedupe(newLinks.map((link) => link.routeId)).length,
    rewrittenRoutes: changedRoutes,
    leadRouteBefore: beforeRationales[0]
      ? {
          routeTitle: beforeRationales[0].routeTitle,
          whyThisRouteExists: beforeRationales[0].whyThisRouteExists,
          whatSupportsIt: beforeRationales[0].whatSupportsIt,
          confidenceLabel: beforeRationales[0].confidenceLabel,
          linkSource: beforeRationales[0].linkSource,
        }
      : null,
    leadRouteAfter: afterRationales[0]
      ? {
          routeTitle: afterRationales[0].routeTitle,
          whyThisRouteExists: afterRationales[0].whyThisRouteExists,
          whatSupportsIt: afterRationales[0].whatSupportsIt,
          confidenceLabel: afterRationales[0].confidenceLabel,
          linkSource: afterRationales[0].linkSource,
        }
      : null,
  }, null, 2));
}

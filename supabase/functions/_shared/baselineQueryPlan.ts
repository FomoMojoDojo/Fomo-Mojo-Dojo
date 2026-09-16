// Baseline query plan (gate B, operator direction 2026-09-16).
//
//   domain    — today's eight passes, byte-identical (the snapshot test pins them): every pass embeds
//               the company's domain / stem / site: terms alongside the name variants.
//   name_only — for a company with no public site: the SAME passes with every domain, stem and
//               `site:` term removed and the name variants kept. A pass that would become empty or
//               domain-only is dropped (null) — never sent blank. F and G (the LinkedIn site:-scoped
//               passes) drop: without a domain/stem they are the name alone under a site: scope, and
//               the LinkedIn slug inference already covers that ground.
//
// The plan is pure: no I/O, no env. public-baseline runs each non-null pass in order with its count.
export type PlanKind = "domain" | "name_only";
export type QueryKey = "queryA" | "queryB" | "queryC" | "queryD" | "queryE" | "queryF" | "queryG" | "queryH";
export type BaselineQueryPlan = Record<QueryKey, string | null>;

export const QUERY_COUNTS: Record<QueryKey, number> = { queryA: 20, queryB: 20, queryC: 20, queryD: 16, queryE: 16, queryF: 16, queryG: 16, queryH: 20 };
export const QUERY_KEYS: QueryKey[] = ["queryA", "queryB", "queryC", "queryD", "queryE", "queryF", "queryG", "queryH"];

export function buildBaselineQueryPlan(args: {
  planKind: PlanKind;
  companyName: string;
  domain: string;
  stem: string;
  variants: string[];
  spaced: string;
}): BaselineQueryPlan {
  const { companyName, domain, stem, variants, spaced } = args;
  const quoted = `"${companyName}"`;
  if (args.planKind === "domain") {
    return {
      queryA:
        `${quoted} (site:${domain} OR "${domain}" OR "${stem}") ` +
        `("about" OR "company" OR "press" OR "investor" OR "careers")`,
      queryB:
        `"${spaced}" "${domain}" (company OR product OR services OR platform) ` +
        `(competitors OR pricing OR reviews OR news OR investors)`,
      queryC:
        `${domain} ${variants.join(" OR ")} (about OR company OR pricing OR reviews OR news)`,
      queryD:
        `"${spaced}" "${domain}" (glassdoor OR indeed OR g2 OR capterra OR trustpilot OR reddit OR forum OR complaints)`,
      queryE:
        `${quoted} "${domain}" (customer reviews OR employee reviews OR testimonials OR ratings OR reddit OR community OR nonprofit)`,
      queryF:
        `site:linkedin.com/company ("${companyName}" OR "${spaced}" OR "${domain}" OR "${stem}")`,
      queryG:
        `site:linkedin.com/posts ("${companyName}" OR "${spaced}" OR "${domain}" OR "${stem}")`,
      queryH:
        `"${spaced}" ("${companyName}" OR "${stem}") (company OR platform OR product OR services OR leadership OR funding OR linkedin OR crunchbase OR newsroom)`,
    };
  }
  // name_only: the name variants carry every pass; no domain, no stem, no site:
  const nameVariants = variants.filter((v) => v && v.toLowerCase() !== domain.toLowerCase() && v.toLowerCase() !== stem.toLowerCase());
  const nameOr = nameVariants.length ? nameVariants.map((v) => `"${v}"`).join(" OR ") : quoted;
  return {
    queryA: `${quoted} ("about" OR "company" OR "press" OR "investor" OR "careers")`,
    queryB: `"${spaced}" (company OR product OR services OR platform) (competitors OR pricing OR reviews OR news OR investors)`,
    queryC: `(${nameOr}) (about OR company OR pricing OR reviews OR news)`,
    queryD: `"${spaced}" (glassdoor OR indeed OR g2 OR capterra OR trustpilot OR reddit OR forum OR complaints)`,
    queryE: `${quoted} (customer reviews OR employee reviews OR testimonials OR ratings OR reddit OR community OR nonprofit)`,
    queryF: null,
    queryG: null,
    queryH: `"${spaced}" (${quoted}) (company OR platform OR product OR services OR leadership OR funding OR linkedin OR crunchbase OR newsroom)`,
  };
}

/** True when a query still carries a domain-shaped or site:-scoped term (the name-only plan must never). */
export function queryCarriesDomainTerm(query: string, domain: string, stem: string): boolean {
  if (/\bsite:/i.test(query)) return true;
  if (domain && query.toLowerCase().includes(domain.toLowerCase())) return true;
  if (stem && new RegExp(`"${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`, "i").test(query)) return true;
  return false;
}

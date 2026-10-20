// R49 probe (R51, 2026-10-20) — one URL per provider-written profile host ruled into AGGREGATOR_PROFILE_PATTERNS: each must
// open the profile gate AND carry a field brief (never the generic one); the controls (platform-authored directories, the
// list / review / blog paths of gated hosts, the two hosts ruled OUT) must stay shut. No network, no db, no model.
// Plant P3 (the psychologytoday entry removed): gated 19 → 18, missing names it, and the v3 expectation moves 0 → 4 differences.
import { matchGatedUrl, pageBriefFor } from "../../supabase/functions/_shared/aggregatorAuthorship.ts";
const HOSTS: Array<[string, string]> = [
  ["psychologytoday.com", "https://www.psychologytoday.com/us/treatment-rehab/edgewood-center-for-children-and-families-san-francisco-ca/208916"],
  ["findhelp.org", "https://www.findhelp.org/provider/edgewood-center-for-children-and-families--san-francisco-ca/5404091359166464?postal=94102"],
  ["recovery.com", "https://recovery.com/edgewood-center-children-and-families-san-francisco-california/"],
  ["privateschoolreview.com", "https://www.privateschoolreview.com/edgewood-center-for-children-families-profile"],
  ["niche.com", "https://www.niche.com/k12/edgewood-center-for-children-and-families-san-francisco-ca/"],
  ["givefreely.com", "https://givefreely.com/charity-directory/nonprofit/ein-941186168/"],
  ["birdeye.com", "https://reviews.birdeye.com/edgewood-center-for-children-and-families-155721653686376"],
  ["angi.com", "https://www.angi.com/companylist/us/tx/forney/iaqm-llc-reviews-6181725.htm"],
  ["homeadvisor.com", "https://www.homeadvisor.com/rated.IAQMIndoorAirQuality.3035078.html"],
  ["thumbtack.com", "https://www.thumbtack.com/tx/dallas/mold-remediation/iaqm-llc/service/248555942655026207"],
  ["buildzoom.com", "https://www.buildzoom.com/contractor/iaqm-llc-tx"],
  ["alignable.com", "https://www.alignable.com/forney-tx/iaqm"],
  ["chamberofcommerce.com", "https://www.chamberofcommerce.com/business-directory/massachusetts/medford/engineering-consultant/2026735084-ground-up-innovations"],
  ["findmoldremoval.com", "https://www.findmoldremoval.com/texas/dallas/iaqm"],
  ["apps.apple.com", "https://apps.apple.com/us/app/gotham-sports/id6499055697?see-all=reviews"],
  ["play.google.com", "https://play.google.com/store/apps/details?id=com.gothamsports.gotham.mobile&hl=en_US"],
  ["bestbuy.com", "https://www.bestbuy.com/site/brands/sonos/pcmcat348700050016.c?id=pcmcat348700050016"],
  ["seamless.ai", "https://seamless.ai/b/whispering-ai-16131131"],
  ["business.newportbeach.com", "https://business.newportbeach.com/directory/Details/coreviva-4149096"],
];
const CONTROLS = [
  "https://www.usnews.com/education/k12/california/edgewood-center-for-children-families-410740",
  "https://www.freementalhealth.us/services/san-francisco_edgewood-center-for-children-families",
  "https://tracxn.com/d/companies/wasabi/__e2WSworMDi7bSLAMLU5S87RLAqkPs1aQPUaPnYmkrN4",
  "https://www.globaldata.com/company-profile/sonos-inc/",
  "https://www.homeadvisor.com/tloc/Dallas-TX/Indoor-Air-Quality-Testing/",
  "https://www.niche.com/k12/edgewood-center-for-children-and-families-san-francisco-ca/reviews/",
  "https://recovery.com/blog/some-article/",
];
const missing: string[] = []; const unbriefed: string[] = []; let gated = 0, briefed = 0;
for (const [host, url] of HOSTS) {
  const g = matchGatedUrl(url);
  if (g && g.host === host && g.via === "profile") gated++; else missing.push(host);
  const b = pageBriefFor(url);
  if (b.host === host && !b.brief.startsWith("Third-party company profile page")) briefed++; else unbriefed.push(host);
}
const open = CONTROLS.filter((u) => matchGatedUrl(u) !== null);
console.log(JSON.stringify({ hosts: HOSTS.length, gated, briefed, missing, unbriefed, controls: CONTROLS.length, controls_ungated: CONTROLS.length - open.length, controls_open: open }));

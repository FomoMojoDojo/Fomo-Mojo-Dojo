/*
 * EOV-1 — the Elements of Value REFERENCE LIBRARY (client-view standards
 * register). Bain & Company's published value taxonomies, stored as they were
 * published and shown as the standard. True-by-reference: no scoring, no
 * corroboration, no company data — see src/lib/referenceLibrary.ts for the law.
 *
 * ══ KEYS ARE FROZEN ONCE SHIPPED ══════════════════════════════════════════════
 * `key` is the PERMANENT join surface for the future company-specific selection
 * layer (declared hypotheses reference an element by key as plain text — no FK,
 * one-directional, per the design gate). Therefore:
 *
 *   * RENAMING A KEY IS A DATA MIGRATION. Never rename one to tidy it up.
 *   * `label` and `description` are FREE to edit — they are display text and
 *     nothing joins on them.
 *
 * This is the lesson of _shared/industryStepAnchors.ts, where identity IS the
 * display label and a copy edit is therefore a silent breaking change.
 *
 * ══ FIDELITY ═════════════════════════════════════════════════════════════════
 * `label` is Bain's element name VERBATIM as printed in the published pyramid
 * exhibits (transcribed from the HBR reprints — R1609C p.7 and the March–April
 * 2018 B2B exhibit p.6). `description` is an AUTHORED GLOSS, not Bain's words;
 * Bain publishes element names in the pyramid, not one-line definitions.
 *
 * Two transcription rulings worth not re-litigating:
 *   * B2C "Provides access" is EMOTIONAL, not functional. Several secondhand
 *     web renderings duplicate it into both tiers; the HBR exhibit does not.
 *   * B2B "PURPOSE" is a SUB-GROUP HEADING, not an element. Taking it as an
 *     element yields 41 elements and 37 non-table-stakes; Bain states 40 and
 *     "the 36 non-table-stakes elements". As a heading both figures land exactly
 *     (4+5+21+7+3 = 40; 36 non-table-stakes), and the article prose names only
 *     three inspirational elements: vision, hope, social responsibility.
 *   * B2B "Ease of doing business" holds 21 elements, not the 19 commonly cited
 *     secondhand.
 */

import type { ReferenceAttribution } from "@/lib/referenceLibrary";

// ── Attribution — rendered on-surface, structurally required ──────────────────
export const B2C_ATTRIBUTION: ReferenceAttribution = {
  source: "Bain & Company",
  publication: '"The Elements of Value" · Harvard Business Review, September 2016',
  retrievedNote: "Element names transcribed from the published pyramid exhibit.",
};

export const B2B_ATTRIBUTION: ReferenceAttribution = {
  source: "Bain & Company",
  publication: '"The B2B Elements of Value" · Harvard Business Review, March–April 2018',
  retrievedNote: "Element names transcribed from the published pyramid exhibit.",
};

// ── Tiers ────────────────────────────────────────────────────────────────────
/** Bain's published B2C tiers — stored as published (4 tiers). */
export type B2cTier = "functional" | "emotional" | "life_changing" | "social_impact";

/** Bain's published B2B tiers — stored AND rendered as published (5 tiers). */
export type B2bTier =
  | "table_stakes"
  | "functional"
  | "ease_of_doing_business"
  | "individual"
  | "inspirational";

export type ValueElementTier = B2cTier | B2bTier;

/**
 * The B2C RENDER grouping — Life-changing and Social impact merge into
 * "Aspirational" (Map & Fire workbook presentation). This is a RENDER decision
 * derived from the stored 4-tier data, never a stored value: the data stays
 * verbatim-attributable and the merge can be undone without a migration.
 */
export type B2cDisplayTier = "functional" | "emotional" | "aspirational";

export function toB2cDisplayTier(tier: B2cTier): B2cDisplayTier {
  return tier === "life_changing" || tier === "social_impact" ? "aspirational" : tier;
}

// ── Element keys — FROZEN. See the header. ───────────────────────────────────
// B2C keys are bare; B2B keys carry a `b2b_` prefix so the two pyramids can
// never collide on a shared concept (e.g. reduces_anxiety / b2b_reduced_anxiety).
export type B2cElementKey =
  | "saves_time"
  | "simplifies"
  | "makes_money"
  | "reduces_risk"
  | "organizes"
  | "integrates"
  | "connects"
  | "reduces_effort"
  | "avoids_hassles"
  | "reduces_cost"
  | "quality"
  | "variety"
  | "sensory_appeal"
  | "informs"
  | "reduces_anxiety"
  | "rewards_me"
  | "nostalgia"
  | "design_aesthetics"
  | "badge_value"
  | "wellness"
  | "therapeutic_value"
  | "fun_entertainment"
  | "attractiveness"
  | "provides_access"
  | "provides_hope"
  | "self_actualization"
  | "motivation"
  | "heirloom"
  | "affiliation_belonging"
  | "self_transcendence";

export type B2bElementKey =
  | "b2b_meeting_specifications"
  | "b2b_acceptable_price"
  | "b2b_regulatory_compliance"
  | "b2b_ethical_standards"
  | "b2b_improved_top_line"
  | "b2b_cost_reduction"
  | "b2b_product_quality"
  | "b2b_scalability"
  | "b2b_innovation"
  | "b2b_time_savings"
  | "b2b_reduced_effort"
  | "b2b_decreased_hassles"
  | "b2b_information"
  | "b2b_transparency"
  | "b2b_organization"
  | "b2b_simplification"
  | "b2b_connection"
  | "b2b_integration"
  | "b2b_availability"
  | "b2b_variety"
  | "b2b_configurability"
  | "b2b_responsiveness"
  | "b2b_expertise"
  | "b2b_commitment"
  | "b2b_stability"
  | "b2b_cultural_fit"
  | "b2b_risk_reduction"
  | "b2b_reach"
  | "b2b_flexibility"
  | "b2b_component_quality"
  | "b2b_network_expansion"
  | "b2b_marketability"
  | "b2b_reputational_assurance"
  | "b2b_design_aesthetics"
  | "b2b_growth_development"
  | "b2b_reduced_anxiety"
  | "b2b_fun_perks"
  | "b2b_vision"
  | "b2b_hope"
  | "b2b_social_responsibility";

export type ValueElementKey = B2cElementKey | B2bElementKey;

export type ValueElement = {
  /** FROZEN once shipped — the join surface for the future selection layer. */
  key: ValueElementKey;
  /** Bain's published element name, verbatim. Free to re-case for display only. */
  label: string;
  tier: ValueElementTier;
  /** AUTHORED GLOSS — not Bain's words. Free to edit. */
  description: string;
  pyramid: "b2c" | "b2b";
  /**
   * Bain's published sub-group within a tier (Economic, Productivity, Career, …).
   * Carried for fidelity; the B2B render groups by tier per the design gate.
   */
  group?: string;
};

// ── B2C — 30 elements, stored in Bain's 4 published tiers ────────────────────
// Order within each tier follows the published pyramid, base to apex. Never sorted.
export const B2C_ELEMENTS: readonly (ValueElement & { tier: B2cTier })[] = [
  // Functional (14)
  { key: "saves_time", label: "Saves time", tier: "functional", pyramid: "b2c", description: "Gives back hours that the task would otherwise consume." },
  { key: "simplifies", label: "Simplifies", tier: "functional", pyramid: "b2c", description: "Takes something complicated and makes it easy to grasp or do." },
  { key: "makes_money", label: "Makes money", tier: "functional", pyramid: "b2c", description: "Produces income or financial return for the buyer." },
  { key: "reduces_risk", label: "Reduces risk", tier: "functional", pyramid: "b2c", description: "Limits the chance or cost of a bad outcome." },
  { key: "organizes", label: "Organizes", tier: "functional", pyramid: "b2c", description: "Brings order to things that were scattered or unmanaged." },
  { key: "integrates", label: "Integrates", tier: "functional", pyramid: "b2c", description: "Makes separate parts work together as one." },
  { key: "connects", label: "Connects", tier: "functional", pyramid: "b2c", description: "Links people to other people." },
  { key: "reduces_effort", label: "Reduces effort", tier: "functional", pyramid: "b2c", description: "Lowers the work required to get the result." },
  { key: "avoids_hassles", label: "Avoids hassles", tier: "functional", pyramid: "b2c", description: "Removes friction, waiting, and irritation from the process." },
  { key: "reduces_cost", label: "Reduces cost", tier: "functional", pyramid: "b2c", description: "Lowers what the buyer has to spend." },
  { key: "quality", label: "Quality", tier: "functional", pyramid: "b2c", description: "Performs better or lasts longer than the alternatives." },
  { key: "variety", label: "Variety", tier: "functional", pyramid: "b2c", description: "Offers a range of choices rather than a single option." },
  { key: "sensory_appeal", label: "Sensory appeal", tier: "functional", pyramid: "b2c", description: "Pleases through look, sound, taste, smell, or feel." },
  { key: "informs", label: "Informs", tier: "functional", pyramid: "b2c", description: "Gives the buyer knowledge they did not have." },

  // Emotional (10)
  { key: "reduces_anxiety", label: "Reduces anxiety", tier: "emotional", pyramid: "b2c", description: "Settles worry about the decision or its consequences." },
  { key: "rewards_me", label: "Rewards me", tier: "emotional", pyramid: "b2c", description: "Returns something back for loyalty or repeat use." },
  { key: "nostalgia", label: "Nostalgia", tier: "emotional", pyramid: "b2c", description: "Evokes a valued memory or earlier time." },
  { key: "design_aesthetics", label: "Design/aesthetics", tier: "emotional", pyramid: "b2c", description: "Is appealing in its form, not only its function." },
  { key: "badge_value", label: "Badge value", tier: "emotional", pyramid: "b2c", description: "Signals something about the owner to other people." },
  { key: "wellness", label: "Wellness", tier: "emotional", pyramid: "b2c", description: "Improves physical or mental health." },
  { key: "therapeutic_value", label: "Therapeutic value", tier: "emotional", pyramid: "b2c", description: "Provides relief or healing from a specific ailment." },
  { key: "fun_entertainment", label: "Fun/entertainment", tier: "emotional", pyramid: "b2c", description: "Is enjoyable or diverting in itself." },
  { key: "attractiveness", label: "Attractiveness", tier: "emotional", pyramid: "b2c", description: "Helps the buyer look better to others." },
  { key: "provides_access", label: "Provides access", tier: "emotional", pyramid: "b2c", description: "Opens up something otherwise out of reach." },

  // Life changing (5)
  { key: "provides_hope", label: "Provides hope", tier: "life_changing", pyramid: "b2c", description: "Offers a credible prospect of something better ahead." },
  { key: "self_actualization", label: "Self-actualization", tier: "life_changing", pyramid: "b2c", description: "Helps the buyer become who they want to be." },
  { key: "motivation", label: "Motivation", tier: "life_changing", pyramid: "b2c", description: "Moves the buyer to act toward a goal." },
  { key: "heirloom", label: "Heirloom", tier: "life_changing", pyramid: "b2c", description: "Holds value that can be passed on beyond the buyer." },
  { key: "affiliation_belonging", label: "Affiliation/belonging", tier: "life_changing", pyramid: "b2c", description: "Makes the buyer part of a group they value." },

  // Social impact (1)
  { key: "self_transcendence", label: "Self-transcendence", tier: "social_impact", pyramid: "b2c", description: "Lets the buyer help others beyond themselves." },
];

// ── B2B — 40 elements, stored and rendered in Bain's 5 published tiers ───────
export const B2B_ELEMENTS: readonly (ValueElement & { tier: B2bTier })[] = [
  // Table stakes (4)
  { key: "b2b_meeting_specifications", label: "Meeting specifications", tier: "table_stakes", pyramid: "b2b", description: "Does what the buyer specified it would do." },
  { key: "b2b_acceptable_price", label: "Acceptable price", tier: "table_stakes", pyramid: "b2b", description: "Prices within the range the buyer can approve." },
  { key: "b2b_regulatory_compliance", label: "Regulatory compliance", tier: "table_stakes", pyramid: "b2b", description: "Meets the rules the buyer's industry is held to." },
  { key: "b2b_ethical_standards", label: "Ethical standards", tier: "table_stakes", pyramid: "b2b", description: "Operates in a way the buyer can stand behind." },

  // Functional (5) — Economic (2), Performance (3)
  { key: "b2b_improved_top_line", label: "Improved top line", tier: "functional", pyramid: "b2b", group: "Economic", description: "Grows the customer's revenue." },
  { key: "b2b_cost_reduction", label: "Cost reduction", tier: "functional", pyramid: "b2b", group: "Economic", description: "Lowers what the customer spends to operate." },
  { key: "b2b_product_quality", label: "Product quality", tier: "functional", pyramid: "b2b", group: "Performance", description: "Performs to a standard the customer can rely on." },
  { key: "b2b_scalability", label: "Scalability", tier: "functional", pyramid: "b2b", group: "Performance", description: "Expands with the customer without breaking." },
  { key: "b2b_innovation", label: "Innovation", tier: "functional", pyramid: "b2b", group: "Performance", description: "Brings capability the customer did not previously have." },

  // Ease of doing business (21) — Productivity (5), Operational (4), Access (3),
  // Relationship (5), Strategic (4)
  { key: "b2b_time_savings", label: "Time savings", tier: "ease_of_doing_business", pyramid: "b2b", group: "Productivity", description: "Returns time to the customer's team." },
  { key: "b2b_reduced_effort", label: "Reduced effort", tier: "ease_of_doing_business", pyramid: "b2b", group: "Productivity", description: "Takes work off the customer's plate." },
  { key: "b2b_decreased_hassles", label: "Decreased hassles", tier: "ease_of_doing_business", pyramid: "b2b", group: "Productivity", description: "Removes friction from working together." },
  { key: "b2b_information", label: "Information", tier: "ease_of_doing_business", pyramid: "b2b", group: "Productivity", description: "Gives the customer knowledge to act on." },
  { key: "b2b_transparency", label: "Transparency", tier: "ease_of_doing_business", pyramid: "b2b", group: "Productivity", description: "Makes the customer able to see what is happening." },
  { key: "b2b_organization", label: "Organization", tier: "ease_of_doing_business", pyramid: "b2b", group: "Operational", description: "Brings order to the customer's operations." },
  { key: "b2b_simplification", label: "Simplification", tier: "ease_of_doing_business", pyramid: "b2b", group: "Operational", description: "Reduces complexity in how the customer works." },
  { key: "b2b_connection", label: "Connection", tier: "ease_of_doing_business", pyramid: "b2b", group: "Operational", description: "Links the customer's people or systems together." },
  { key: "b2b_integration", label: "Integration", tier: "ease_of_doing_business", pyramid: "b2b", group: "Operational", description: "Fits into what the customer already runs." },
  { key: "b2b_availability", label: "Availability", tier: "ease_of_doing_business", pyramid: "b2b", group: "Access", description: "Is there when and where the customer needs it." },
  { key: "b2b_variety", label: "Variety", tier: "ease_of_doing_business", pyramid: "b2b", group: "Access", description: "Offers a range the customer can choose across." },
  { key: "b2b_configurability", label: "Configurability", tier: "ease_of_doing_business", pyramid: "b2b", group: "Access", description: "Adapts to how the customer specifically works." },
  { key: "b2b_responsiveness", label: "Responsiveness", tier: "ease_of_doing_business", pyramid: "b2b", group: "Relationship", description: "Answers the customer quickly when it matters." },
  { key: "b2b_expertise", label: "Expertise", tier: "ease_of_doing_business", pyramid: "b2b", group: "Relationship", description: "Brings knowledge the customer's team lacks." },
  { key: "b2b_commitment", label: "Commitment", tier: "ease_of_doing_business", pyramid: "b2b", group: "Relationship", description: "Stays invested in the customer's outcome." },
  { key: "b2b_stability", label: "Stability", tier: "ease_of_doing_business", pyramid: "b2b", group: "Relationship", description: "Will still be there for the customer later." },
  { key: "b2b_cultural_fit", label: "Cultural fit", tier: "ease_of_doing_business", pyramid: "b2b", group: "Relationship", description: "Works in a way that matches how the customer works." },
  { key: "b2b_risk_reduction", label: "Risk reduction", tier: "ease_of_doing_business", pyramid: "b2b", group: "Strategic", description: "Lowers the customer's exposure to bad outcomes." },
  { key: "b2b_reach", label: "Reach", tier: "ease_of_doing_business", pyramid: "b2b", group: "Strategic", description: "Extends where the customer can operate." },
  { key: "b2b_flexibility", label: "Flexibility", tier: "ease_of_doing_business", pyramid: "b2b", group: "Strategic", description: "Lets the customer change course without penalty." },
  { key: "b2b_component_quality", label: "Component quality", tier: "ease_of_doing_business", pyramid: "b2b", group: "Strategic", description: "Improves the quality of what the customer builds." },

  // Individual (7) — Career (3), Personal (4)
  { key: "b2b_network_expansion", label: "Network expansion", tier: "individual", pyramid: "b2b", group: "Career", description: "Widens the buyer's professional circle." },
  { key: "b2b_marketability", label: "Marketability", tier: "individual", pyramid: "b2b", group: "Career", description: "Makes the buyer more valuable in their field." },
  { key: "b2b_reputational_assurance", label: "Reputational assurance", tier: "individual", pyramid: "b2b", group: "Career", description: "Protects the buyer from looking wrong for choosing it." },
  { key: "b2b_design_aesthetics", label: "Design & aesthetics", tier: "individual", pyramid: "b2b", group: "Personal", description: "Is pleasing for the buyer to use day to day." },
  { key: "b2b_growth_development", label: "Growth & development", tier: "individual", pyramid: "b2b", group: "Personal", description: "Helps the buyer build their own capability." },
  { key: "b2b_reduced_anxiety", label: "Reduced anxiety", tier: "individual", pyramid: "b2b", group: "Personal", description: "Settles the buyer's worry about the decision." },
  { key: "b2b_fun_perks", label: "Fun & perks", tier: "individual", pyramid: "b2b", group: "Personal", description: "Makes the working relationship enjoyable." },

  // Inspirational (3) — sub-group "Purpose". PURPOSE IS THE HEADING, NOT AN ELEMENT.
  { key: "b2b_vision", label: "Vision", tier: "inspirational", pyramid: "b2b", group: "Purpose", description: "Helps the customer see where their market is going." },
  { key: "b2b_hope", label: "Hope", tier: "inspirational", pyramid: "b2b", group: "Purpose", description: "Gives the customer confidence about what comes next." },
  { key: "b2b_social_responsibility", label: "Social responsibility", tier: "inspirational", pyramid: "b2b", group: "Purpose", description: "Lets the customer do good beyond their own results." },
];

// ── Published shape — the integrity floor for the loud partial-load rule ─────
// If a render finds fewer tiers or elements than Bain published, the surface must
// say so rather than present a truncated taxonomy as the whole standard.
export const B2C_TIER_ORDER: readonly B2cTier[] = ["functional", "emotional", "life_changing", "social_impact"];
export const B2C_DISPLAY_TIER_ORDER: readonly B2cDisplayTier[] = ["functional", "emotional", "aspirational"];
export const B2B_TIER_ORDER: readonly B2bTier[] = [
  "table_stakes",
  "functional",
  "ease_of_doing_business",
  "individual",
  "inspirational",
];

/** Bain's published totals. Used to detect a partial library, never to score. */
export const B2C_PUBLISHED_TOTAL = 30;
export const B2B_PUBLISHED_TOTAL = 40;

export const B2C_DISPLAY_TIER_LABEL: Record<B2cDisplayTier, string> = {
  functional: "Functional",
  emotional: "Emotional",
  aspirational: "Aspirational",
};

export const B2B_TIER_LABEL: Record<B2bTier, string> = {
  table_stakes: "Table stakes",
  functional: "Functional",
  ease_of_doing_business: "Ease of doing business",
  individual: "Individual",
  inspirational: "Inspirational",
};

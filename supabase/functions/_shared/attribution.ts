// ── R32 (operator ruling R35, 2026-10-18): ATTRIBUTED SPEECH IS DETECTED DETERMINISTICALLY ──────────────────
// A LEAF module on purpose: voiceClassAtMint imports the AttributionHit type from here, and every function that imports
// the authority (public-baseline, the restamp, …) must not inherit src/lib's type debt through outsideEvidenceRegen.
// A candidate that quotes or reports a named speaker is handed to the speaker judge (voiceClassAtMint, text gate
// "attributed_speech"). Detection reads the candidate AND its page context: an attribution often trails the
// quotation ("…," said Dr. Alexander), and a candidate lifted from INSIDE an open quotation is one unit with the
// quotation's opening mark, its closing mark and the attribution clause that follows. Quotation marks are “ ” " « »
// ONLY — an apostrophe (’ ') never counts (the pilot-3 row "Scott’s neutrality … AI’s application" is the test).
export type AttributionForm =
  | "quoted_with_attribution"     // “…,” said X / X said / X told Y, the attribution inside the candidate
  | "according_to"                // …, according to X
  | "reported_name_verb"          // …, X said. / …, Alexander told the Journal.
  | "reported_pronoun_verb"       // They explain… / He said…
  | "reported_titled_speaker"     // <Title> <Name> said that… (R48: lowercase titles too — "chief human resources officer Ken Auletta said")
  | "reported_name_appositive"    // R48: <Name>[, appositive,]… said that… — unquoted reported speech, the name at a sentence start
  | "quotation_interior"          // the candidate sits inside an open quotation on the page; the attribution follows the close
  | "first_person";               // R45: the candidate itself speaks as "we" — who "we" is goes to the speaker judge
export type AttributionHit = {
  form: AttributionForm;
  /** the speaker as the page names it — name and any adjacent title; "" when the clause names no one ("according to the company" → "the company") */
  speaker_string: string;
  /** the whole unit: for quotation_interior the quotation plus its attribution clause; otherwise the candidate */
  span: string;
  /** offset of `span` in the page text; -1 when the candidate was not located on the page */
  offset: number;
};
const QUOTE_OPEN = /[“"«]/, QUOTE_CLOSE = /[”"»]/;
// R48 (operator ruling R51, 2026-10-20): the verb list gained called / warned / urged / acknowledged / insisted / reported.
const SPEECH_VERBS = "said|says|say|told|tells|wrote|writes|added|adds|noted|notes|stated|states|explained|explains|explain|commented|comments|recalled|recalls|announced|announces|confirmed|confirms|argues|argued|argue|emphasizes|emphasized|emphasize|describes|described|describe|highlights|highlighted|highlight|credited|credits|claims|claimed|called|calls|warned|warns|urged|urges|acknowledged|acknowledges|insisted|insists|reported|reports";
const TITLE_WORDS = "Dr\\.|CEO|Co-CEO|founder|Founder|co-founder|Co-founder|Co-Founder|Chairman|chairman|Chief [A-Z][a-z]+ Officer|Chief Executive|President|Executive|spokesperson|Spokesperson|Director|director|Chief";
const NAME = "(?:(?:" + TITLE_WORDS + ")\\s+)?[A-Z][\\w.'’-]+(?:\\s+[A-Z][\\w.'’-]+){0,3}";
const RE_TOLD = new RegExp("(" + NAME + ")\\s+(?:told|tells)\\s+(?:the\\s+)?[A-Z][\\w.' -]+");
const RE_SAID_NAME = new RegExp("\\b(?:" + SPEECH_VERBS + ")\\s+(" + NAME + ")");
const RE_NAME_SAID = new RegExp(",\\s*[”\"»]?\\s*(" + NAME + ")\\s+(?:" + SPEECH_VERBS + ")\\b");   // the comma may sit inside the closing quote: ,” Alexander said
const RE_ACCORDING = /\baccording to\s+((?:the\s+|its\s+|their\s+|a\s+)?[\w][\w.'’ -]{1,60}?)(?=[,.;:]|$)/i;
const RE_PRONOUN = new RegExp("^(He|She|They|It)\\s+(?:" + SPEECH_VERBS + ")\\b");
const RE_TITLED = new RegExp("\\b((?:" + TITLE_WORDS + ")\\s+[A-Z][\\w.'’-]+(?:\\s+[A-Z][\\w.'’-]+){0,2})\\s+(?:" + SPEECH_VERBS + ")\\b");
// ── R48 (operator ruling R51, 2026-10-20): UNQUOTED REPORTED SPEECH OF A NAMED SPEAKER ───────────────────────────
// Edgewood's ProPublica row — "Ken Auletta, Edgewood’s chief human resources officer, who led the nonprofit organization’s
// end of the negotiations, said management was equally pleased" — fired no form: RE_NAME_SAID wants a comma right before
// the name (a sentence-initial name never has one), RE_TITLED knows only capitalized titles, and neither allows an
// appositive chain between the name and the verb. Three patterns, measured on the b3 set (R46 diagnostic):
//   P1/P2  a name at a sentence start (the candidate's start, or after . ! ?), an optional chain of up to three
//          comma-delimited appositives, then a speech verb            → reported_name_appositive, speaker = name + chain
//   P4     a LOWERCASE title (chief human resources officer, spokeswoman, mayor …) + a name + a speech verb
//                                                                     → reported_titled_speaker
// Guards from the two measured false positives: a possessive name ("Spence's comments haven't…") is not a speaker, and a
// verb used as a participle ("a Loring S15 added later") is not a report. Function words at a sentence start are never names.
const CAPTOK = "[A-Z][\\w.'’-]+";
const APPOSITIVE_CHAIN = "(?:,\\s[^,]{2,120}){1,3},";
const RE_NAME_APPOSITIVE = new RegExp("(?:^|[.!?]\\s+)((?:" + CAPTOK + "\\s+){0,3}" + CAPTOK + ")(" + APPOSITIVE_CHAIN + ")?\\s+(" + SPEECH_VERBS + ")\\b([^.!?]{0,24})");
const LOWER_TITLE = "(?:(?:chief|senior|vice|executive|managing|general|deputy|associate|assistant|interim|former)\\s+)?(?:[a-z]+(?:[ -][a-z]+){0,3}\\s+)?(?:officer|director|president|manager|founder|co-founder|partner|spokesperson|spokeswoman|spokesman|analyst|head|chair|chairman|chairwoman|supervisor|mayor|professor|counsel|principal|coordinator|lead|owner)";
const RE_LOWER_TITLED = new RegExp("(?<![\\w'’])(" + LOWER_TITLE + ")\\s+(" + CAPTOK + "(?:\\s+" + CAPTOK + "){0,2})\\s+(" + SPEECH_VERBS + ")\\b([^.!?]{0,24})");
const SENTENCE_START_STOP: ReadonlySet<string> = new Set(["The", "This", "That", "These", "Those", "It", "He", "She", "They", "We", "You", "I", "A", "An", "In", "On", "At", "As", "But", "And", "Or", "If", "When", "While", "After", "Before", "One", "Some", "Many", "Most", "Several", "Our", "His", "Her", "Their", "Its", "Who", "What", "Which", "There", "Here", "However", "Also", "Then", "So", "Yet", "Still", "Last", "First", "Next", "Each", "Every", "Both", "All", "No", "Not", "Per", "Via", "By", "To", "For", "From", "With", "Of", "Now", "Today", "Yesterday"]);
const POSSESSIVE_NAME = /['’]s$/i;
const PARTICIPLE_TAIL = /^\s*(?:later|earlier|afterward|afterwards|recently|since|in \d{4}|by\b|$)/i;
/** P1/P2: the name (with its appositive chain) a reported-speech sentence opens with, or null. */
export function matchNameAppositive(t: string): { speaker: string; verb: string } | null {
  const m = RE_NAME_APPOSITIVE.exec(t);
  if (!m) return null;
  const name = m[1], chain = m[2] ?? "", tail = m[4] ?? "";
  const tokens = name.split(/\s+/);
  if (tokens.length === 1 && SENTENCE_START_STOP.has(tokens[0])) return null;   // "They said", "The company said" (lowercase noun) are not names
  if (tokens.every((w) => SENTENCE_START_STOP.has(w))) return null;
  if (POSSESSIVE_NAME.test(tokens[tokens.length - 1]) && !chain) return null;    // "Spence's comments…" — a possessive, not a speaker
  if (PARTICIPLE_TAIL.test(tail)) return null;                                   // "… added later" — a participle, not a report
  return { speaker: clean(name + chain), verb: m[3] };
}
/** P4: a lowercase title + name + speech verb, or null. */
export function matchLowerTitled(t: string): { speaker: string; verb: string } | null {
  const m = RE_LOWER_TITLED.exec(t);
  if (!m) return null;
  if (PARTICIPLE_TAIL.test(m[4] ?? "")) return null;
  return { speaker: clean(m[1] + " " + m[2]), verb: m[3] };
}
const hasSpeechVerb = (t: string) => new RegExp("\\b(?:" + SPEECH_VERBS + ")\\b").test(t);
const clean = (s: string) => s.replace(/\s+/g, " ").replace(/[.,;:]+$/, "").trim();
/** The attribution clause that follows a closing quotation mark: ", said Brian Bowis, Chairman of …" up to the sentence end. */
function trailingClause(after: string): string | null {
  const m = /^[”"»]?\s*,?\s*((?:(?:said|says|told|tells|added|adds|noted|notes|wrote|writes|stated|states|explained|explains|commented|comments|recalled|recalls)\s+)[^.\n]{2,160}|[^.\n]{2,80}\s+(?:said|says|told|tells|added|adds|noted|notes|wrote|writes|stated|states|explained|explains)[^.\n]{0,120})/.exec(after);
  return m ? m[1] : null;
}
function speakerOfClause(clause: string): string {
  // "said Brian Bowis, Chairman of the Foundation" → the name AND the title the page puts beside it (everything after the verb)
  const a = new RegExp("^\\s*(?:" + SPEECH_VERBS + ")\\s+(.+)$").exec(clause.trim()); if (a) return clean(a[1]);
  // "Brian Bowis, Chairman of the Foundation, said" → everything before the verb
  return clean(clause.replace(new RegExp("\\s*\\b(?:" + SPEECH_VERBS + ")\\b.*$"), ""));
}
export function detectAttribution(candidate: string, pageText?: string | null, offsetHint?: number | null): AttributionHit | null {
  const t = String(candidate ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  const page = String(pageText ?? "");
  let offset = typeof offsetHint === "number" && offsetHint >= 0 && page.slice(offsetHint, offsetHint + t.length) === t ? offsetHint : page.indexOf(t);
  const quoted = QUOTE_OPEN.test(t) && QUOTE_CLOSE.test(t);
  if (quoted && hasSpeechVerb(t)) {
    const told = RE_TOLD.exec(t); const said = RE_SAID_NAME.exec(t); const nameSaid = RE_NAME_SAID.exec(t);
    // R48: a sentence-initial name before the verb ("Supervisor Matt Haney called Edgewood “…”") names the speaker; the
    // verb-then-name form is read last, since what follows "called" is the one spoken about, not the speaker
    const appos = matchNameAppositive(t);
    return { form: "quoted_with_attribution", speaker_string: clean(told?.[1] ?? nameSaid?.[1] ?? appos?.speaker ?? said?.[1] ?? ""), span: t, offset };
  }
  const acc = RE_ACCORDING.exec(t);
  if (acc) return { form: "according_to", speaker_string: clean(acc[1]), span: t, offset };
  const told = RE_TOLD.exec(t);
  if (told) return { form: "reported_name_verb", speaker_string: clean(told[1]), span: t, offset };
  const nameSaid = RE_NAME_SAID.exec(t);
  if (nameSaid) return { form: "reported_name_verb", speaker_string: clean(nameSaid[1]), span: t, offset };
  const titled = RE_TITLED.exec(t);
  if (titled) return { form: "reported_titled_speaker", speaker_string: clean(titled[1]), span: t, offset };
  // R48: unquoted reported speech — a sentence-initial name with its appositive chain, or a lowercase-titled speaker
  const appos = matchNameAppositive(t);
  if (appos) return { form: "reported_name_appositive", speaker_string: appos.speaker, span: t, offset };
  const lower = matchLowerTitled(t);
  if (lower) return { form: "reported_titled_speaker", speaker_string: lower.speaker, span: t, offset };
  const pron = RE_PRONOUN.exec(t);
  if (pron) return { form: "reported_pronoun_verb", speaker_string: pron[1], span: t, offset };
  // the open-quotation rule: the candidate sits inside a quotation that opened before it and closes after it
  if (offset >= 0 && page) {
    const before = page.slice(Math.max(0, offset - 600), offset);
    const lastOpen = Math.max(before.lastIndexOf("“"), before.lastIndexOf("«"), before.lastIndexOf('"'));
    if (lastOpen >= 0) {
      const sinceOpen = before.slice(lastOpen + 1);
      if (!QUOTE_CLOSE.test(sinceOpen.replace(/^"/, ""))) {   // no close between the opening mark and the candidate
        const after = page.slice(offset + t.length, offset + t.length + 700);
        const closeAt = after.search(QUOTE_CLOSE);
        if (closeAt >= 0) {
          const clause = trailingClause(after.slice(closeAt));
          if (clause) {
            const unitStart = Math.max(0, offset - 600) + lastOpen;
            const unitEnd = offset + t.length + closeAt + 1 + (after.slice(closeAt).indexOf(clause) + clause.length);
            return { form: "quotation_interior", speaker_string: speakerOfClause(clause), span: page.slice(unitStart, unitEnd), offset: unitStart };
          }
        }
      }
    }
    // a quotation that is the candidate itself, with the attribution in the next sentence
    if (quoted) { const clause = trailingClause(page.slice(offset + t.length, offset + t.length + 300)); if (clause) return { form: "quoted_with_attribution", speaker_string: speakerOfClause(clause), span: t + page.slice(offset + t.length, offset + t.length + 300).slice(0, page.slice(offset + t.length, offset + t.length + 300).indexOf(clause) + clause.length), offset }; }
  }
  return null;
}


// ── R42 (operator ruling 2026-10-20): THE SPEAKER JUDGE'S CONTEXT REACHES PAST THE PARAGRAPH ───────────────────
// Riverlane's fortune.com page names Steve Brierley as founder and CEO two paragraphs above the quotations attributed
// to "Brierley"; the judge, given only the quote's paragraph, answered unknown and three true lifts were refused.
// The context is now the paragraph PLUS every page sentence containing the speaker string or its last token (4+ chars),
// deduped, in order of appearance, cut at SPEAKER_CONTEXT_CAP with the paragraph kept whole.
export const SPEAKER_CONTEXT_CAP = 3600;
/** The paragraph the span sits in: from the previous blank line to the next, capped. */
export function paragraphOf(page: string, offset: number, length: number): string {
  const sep = page.lastIndexOf("\n\n", offset);
  const start = Math.max(0, sep >= 0 ? sep + 2 : 0, offset - 1200);   // after the separator, never including it
  const endNl = page.indexOf("\n\n", offset + length);
  const end = Math.min(page.length, endNl < 0 ? offset + length + 1200 : endNl, offset + length + 1200);
  return page.slice(start, end);
}
export function speakerContext(page: string, offset: number, length: number, speakerString: string, cap = SPEAKER_CONTEXT_CAP): string {
  const paragraph = paragraphOf(page, offset, length);
  const name = String(speakerString ?? "").replace(/\s+/g, " ").trim();
  if (!name) return paragraph.slice(0, Math.max(cap, paragraph.length));
  const tokens = name.split(/[\s,]+/).filter(Boolean);
  const last = tokens[tokens.length - 1] ?? "";
  const needles = [name.toLowerCase(), ...(last.length >= 4 ? [last.toLowerCase()] : [])];
  const seen = new Set<string>();
  let out = paragraph;   // kept whole even when it alone exceeds the cap
  for (const m of page.matchAll(/[^.!?\n]+[.!?]+/g)) {
    const sentence = m[0].trim();
    const low = sentence.toLowerCase();
    if (!needles.some((n) => low.includes(n))) continue;
    if (paragraph.includes(sentence) || seen.has(sentence)) continue;
    if (out.length + 1 + sentence.length > cap) break;
    seen.add(sentence);
    out += "\n" + sentence;
  }
  return out;
}

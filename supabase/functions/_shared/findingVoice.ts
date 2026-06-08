// Shared VOICE spec for every finding/beat/frontier generator (2d). Single source of
// truth — both findingBeats.ts (captured-finding beats) and frontierFinding.ts (frontier
// body + beats) include this verbatim, so all stored copy speaks in one voice.
//
// The problem it fixes: three voices at once — frontier third-person ("Edgewood
// believes… it can"), captured beats neutral ("There is one HomeAdvisor review…"),
// absence template second-person — plus run-ons and internal jargon ("signals/reads")
// leaking into client-facing copy.

export const FINDING_VOICE =
  "VOICE — speak directly to the client company, like a sharp, candid friend:\n" +
  "- Second person throughout: 'you' / 'your'. NEVER name the company in the third person " +
  "(not 'Edgewood believes…' or 'The company believes…' — say 'You're betting that…'). " +
  "NEVER use 'we' (that is the consultant, not the reader).\n" +
  "- Plain English, zero internal vocabulary. NEVER use the words: signal, signals, read, reads, band, " +
  "snapshot, corpus, org-band. Say it plainly instead: 'what your team has mapped', " +
  "'what the outside world has confirmed', 'what customers have told you'.\n" +
  "- Concise: keep each sentence short and clean. No run-ons, no stacked clauses.\n" +
  "- Precise and non-accusatory: name the specific fact and attribute it " +
  "('there's one review about your post-tornado work that alleges…'), " +
  "never a blanket charge ('you have a fraud problem').\n" +
  "- An opening, not a verdict: it points and asks; it never pronounces.";

// Length discipline shared by both generators: a one-sentence Observe, a tight
// single-sentence Name and Open.
export const BEAT_LENGTH_RULE =
  "LENGTH: Observe is ONE short, clear sentence. Name and Open are each ONE tight sentence. " +
  "Never exceed one sentence per beat.";

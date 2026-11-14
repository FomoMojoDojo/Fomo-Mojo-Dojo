-- `chars_capped` now means "a cap cut this read", not only the character cap (SP-271, SP-272).
--
-- WHY REUSE IT RATHER THAN ADD A COLUMN. SP-271 replaced the character read cap with a WINDOW count
-- derived from the hand-off budget — 30 windows at a 10,000-character budget — because window count
-- is not a function of characters and no character cap could bound it (a 6,001-character block cannot
-- share a 12,000-character window, so 350,000 characters is 30 windows at the Charter 10-Q's page
-- density and 59 when blocks are that size).
--
-- A document cut by that window cap has to say so, and SP-272 forbids a new string. `chars_capped`
-- ALREADY governs the string that says it — S-ING-4, "Only the first part of this document was
-- read." — which is exactly true of a window cut. A second boolean would have meant a second
-- condition in every surface that renders S-ING-4, for a sentence the reader cannot tell apart.
--
-- THE NAME IS NOW NARROWER THAN THE MEANING, and that is the cost of reuse. It is recorded here
-- rather than fixed by a rename, because every reader of this column is a renderer of S-ING-4 and
-- none of them distinguishes the two causes. The LOG line distinguishes them (`capped_by:
-- "windows" | "chars" | "none"`) for whoever is debugging a specific document.
--
-- 350,000 characters remains as a BACKSTOP only (SP-271): it bounds extraction work on a pathological
-- file, while the window cap is what bounds the read.

comment on column public.file_proposals.chars_capped is
  'SP-231, SP-271, SP-272: true when a cap cut this read — either the window cap (maxWindowsForBudget(), 30 at a 10,000-character hand-off budget, the usual cause) or the 350,000-character extraction backstop. Governs S-ING-4, "Only the first part of this document was read.", which is true of both. NEVER inferred from chars_total vs extraction_chars: those also differ by whitespace compaction, which loses nothing. Which cap bit is in the worker log as capped_by.';

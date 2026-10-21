// R54 type refusal: `deno check` of this file passes ONLY while a judge call without a context is a type error.
// If AuthorshipInput.context ever became optional, the @ts-expect-error below would be unused and deno check would fail.
import { judgeAggregatorAuthorship } from "../../supabase/functions/_shared/aggregatorAuthorship.ts";
const t = () => Promise.resolve({ content: "{}", prompt_tokens: null, completion_tokens: null });
export const probe = () =>
  // @ts-expect-error — R54: the context argument is required
  judgeAggregatorAuthorship({ subjectName: "A", subjectHost: "a.com", url: "https://x.test/", text: "t" }, { transport: t, ledger: () => Promise.resolve(true) });

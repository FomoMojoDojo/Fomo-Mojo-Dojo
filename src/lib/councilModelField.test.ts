// Council trial (2026-11-15): council-review's optional `model` body field — refused by name unless the run is
// {write:false}, the caller is an admin and the local Ollama lists the tag; absent, the default is untouched.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { listLocalOllamaTags, resolveCouncilModel } from "../../supabase/functions/_shared/councilLocal.ts";

const DEFAULT = "qwen2.5:14b-instruct";
const listed = () => vi.fn(async () => ["qwen2.5:14b-instruct", "qwen3.6:35b"]);

describe("council-review `model` field", () => {
  it("absent: the default model, no override, and the tag list is never read", async () => {
    const listTags = listed();
    for (const dryRun of [true, false]) {
      expect(await resolveCouncilModel({ requested: undefined, dryRun, isAdmin: true, defaultModel: DEFAULT, listTags }))
        .toEqual({ ok: true, model: DEFAULT, override: false });
    }
    expect(listTags).not.toHaveBeenCalled();
  });

  it("refuses with write true or absent (model_requires_no_write), before the tag list is read", async () => {
    const listTags = listed();
    const r = await resolveCouncilModel({ requested: "qwen3.6:35b", dryRun: false, isAdmin: true, defaultModel: DEFAULT, listTags });
    expect(r).toMatchObject({ ok: false, status: 400, error: "model_requires_no_write" });
    expect(listTags).not.toHaveBeenCalled();
  });

  it("refuses a non-admin caller (model_requires_admin)", async () => {
    const listTags = listed();
    const r = await resolveCouncilModel({ requested: "qwen3.6:35b", dryRun: true, isAdmin: false, defaultModel: DEFAULT, listTags });
    expect(r).toMatchObject({ ok: false, status: 403, error: "model_requires_admin" });
    expect(listTags).not.toHaveBeenCalled();
  });

  it("refuses a tag the local Ollama does not list (model_not_listed), an empty tag, and an unreadable list", async () => {
    expect(await resolveCouncilModel({ requested: "gpt-4.1-mini", dryRun: true, isAdmin: true, defaultModel: DEFAULT, listTags: listed() }))
      .toMatchObject({ ok: false, status: 400, error: "model_not_listed" });
    expect(await resolveCouncilModel({ requested: "", dryRun: true, isAdmin: true, defaultModel: DEFAULT, listTags: listed() }))
      .toMatchObject({ ok: false, error: "model_invalid" });
    expect(await resolveCouncilModel({ requested: "qwen3.6:35b", dryRun: true, isAdmin: true, defaultModel: DEFAULT, listTags: async () => { throw new Error("down"); } }))
      .toMatchObject({ ok: false, status: 503, error: "model_tags_unavailable" });
  });

  it("accepts a listed tag on a no-write admin run", async () => {
    expect(await resolveCouncilModel({ requested: "qwen3.6:35b", dryRun: true, isAdmin: true, defaultModel: DEFAULT, listTags: listed() }))
      .toEqual({ ok: true, model: "qwen3.6:35b", override: true });
  });

  it("reads tags only from a local address, from /api/tags", async () => {
    const fetchImpl = vi.fn(async (_url: string) => new Response(JSON.stringify({ models: [{ name: "qwen3.6:35b", model: "qwen3.6:35b" }, { name: "llama3:8b" }] })));
    expect(await listLocalOllamaTags("http://host.docker.internal:11434/v1", fetchImpl as unknown as typeof fetch)).toEqual(["qwen3.6:35b", "llama3:8b"]);
    expect(String(fetchImpl.mock.calls[0][0])).toBe("http://host.docker.internal:11434/api/tags");
    await expect(listLocalOllamaTags("https://api.openai.com/v1", fetchImpl as unknown as typeof fetch)).rejects.toThrow(/local-only/);
  });

  it("the handler refuses before the run row is written, and the model that ran names the run row and ledger rows", () => {
    const src = readFileSync("supabase/functions/council-review/index.ts", "utf8");
    const refuse = src.indexOf("if (!modelChoice.ok) return jsonResponse(");
    expect(refuse).toBeGreaterThan(0);
    expect(refuse).toBeLessThan(src.indexOf('.from("council_review_runs")\n      .insert('));
    expect(refuse).toBeLessThan(src.indexOf("callLocalCouncilJSON({"));
    expect(src).toContain("localModel = modelChoice.model;");
    expect(src).toContain("model: `local_ollama:${localModel}`");
    expect(src).toContain('usage: { provider: "local_ollama", model: usedModel');
    expect(src).toContain('let localModel = Deno.env.get("COUNCIL_LOCAL_MODEL") ?? COUNCIL_LOCAL_DEFAULT_MODEL;');
  });
});

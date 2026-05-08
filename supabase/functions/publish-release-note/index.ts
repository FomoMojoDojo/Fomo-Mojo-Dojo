import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-publish-secret",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

// ── Markdown → Notion blocks ──────────────────────────────────────────────────

type NotionRichText = {
  type: "text";
  text: { content: string };
};

type NotionBlock =
  | { object: "block"; type: "heading_1";   heading_1:   { rich_text: NotionRichText[] } }
  | { object: "block"; type: "heading_2";   heading_2:   { rich_text: NotionRichText[] } }
  | { object: "block"; type: "heading_3";   heading_3:   { rich_text: NotionRichText[] } }
  | { object: "block"; type: "bulleted_list_item"; bulleted_list_item: { rich_text: NotionRichText[] } }
  | { object: "block"; type: "paragraph";   paragraph:   { rich_text: NotionRichText[] } };

function richText(content: string): NotionRichText[] {
  return [{ type: "text", text: { content } }];
}

function markdownToBlocks(content: string): NotionBlock[] {
  const blocks: NotionBlock[] = [];

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trimEnd();

    if (line.trim() === "") continue;

    if (line.startsWith("### ")) {
      blocks.push({ object: "block", type: "heading_3", heading_3: { rich_text: richText(line.slice(4)) } });
    } else if (line.startsWith("## ")) {
      blocks.push({ object: "block", type: "heading_2", heading_2: { rich_text: richText(line.slice(3)) } });
    } else if (line.startsWith("# ")) {
      blocks.push({ object: "block", type: "heading_1", heading_1: { rich_text: richText(line.slice(2)) } });
    } else if (line.startsWith("- ")) {
      blocks.push({ object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: richText(line.slice(2)) } });
    } else {
      blocks.push({ object: "block", type: "paragraph", paragraph: { rich_text: richText(line) } });
    }
  }

  return blocks;
}

// ── Handler ───────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const PUBLISH_SECRET = Deno.env.get("PUBLISH_SECRET");
    const incomingSecret = req.headers.get("x-publish-secret");

    if (!PUBLISH_SECRET || incomingSecret !== PUBLISH_SECRET) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Config ──────────────────────────────────────────────────────────────
    const NOTION_TOKEN = Deno.env.get("NOTION_TOKEN");
    const NOTION_RELEASE_NOTES_PAGE_ID =
      Deno.env.get("NOTION_RELEASE_NOTES_PAGE_ID") ?? "32ff0a3f-6171-806e-8d38-f86d1b285d93";

    if (!NOTION_TOKEN) {
      return new Response(
        JSON.stringify({ error: "Notion is not configured — set NOTION_TOKEN in Supabase secrets." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Body ────────────────────────────────────────────────────────────────
    const body = await req.json() as { title?: string; content?: string };
    const { title, content } = body;

    if (!title || typeof title !== "string" || title.trim() === "") {
      return new Response(
        JSON.stringify({ error: "title is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const blocks = markdownToBlocks(content ?? "");

    console.log("[publish-release-note] title:", title);
    console.log("[publish-release-note] block count:", blocks.length);
    console.log("[publish-release-note] parent page:", NOTION_RELEASE_NOTES_PAGE_ID);

    // ── Create Notion page ──────────────────────────────────────────────────
    const notionRes = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${NOTION_TOKEN}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        parent: { page_id: NOTION_RELEASE_NOTES_PAGE_ID },
        properties: {
          title: {
            title: [{ type: "text", text: { content: title.trim() } }],
          },
        },
        children: blocks,
      }),
    });

    const rawNotionResponse = await notionRes.text();
    console.log("[publish-release-note] Notion HTTP status:", notionRes.status);

    if (!notionRes.ok) {
      console.log("[publish-release-note] Notion error:", rawNotionResponse.slice(0, 500));
      return new Response(
        JSON.stringify({ error: `Notion API error (${notionRes.status}): ${rawNotionResponse}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const page = JSON.parse(rawNotionResponse) as Record<string, unknown>;
    const pageId   = String(page.id ?? "").replace(/-/g, "");
    const pageUrl  = (page.url as string | undefined) ?? `https://notion.so/${pageId}`;

    console.log("[publish-release-note] created page id:", page.id);

    return new Response(
      JSON.stringify({ ok: true, url: pageUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.log("[publish-release-note] unhandled error:", String((err as Error)?.message ?? err));
    return new Response(
      JSON.stringify({ error: String((err as Error)?.message ?? err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

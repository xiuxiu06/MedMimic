import type { NextRequest } from "next/server";
import { chunkById, toPassageView } from "@/lib/rag";

// GET /api/guidelines/:id — the verbatim guideline passage behind a citation tag.
// Static data from data/guidelines.json; no Gemini call, no quota.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/guidelines/[id]">) {
  const { id } = await ctx.params;
  const chunk = chunkById(id);
  if (!chunk) return Response.json({ error: `Unknown passage "${id}"` }, { status: 404 });
  return Response.json(toPassageView(chunk), {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}

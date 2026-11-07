import { gemini } from "@/lib/gemini";
import { MODELS } from "@/lib/models";

// GET /api/health — confirms the deploy is up and the Gemini key can see our models.
// Uses models.get (metadata only), so it does NOT consume generateContent quota.
export async function GET() {
  try {
    const checks = await Promise.all(
      [MODELS.classifier, MODELS.debrief, MODELS.embedding].map(async (model) => {
        const m = await gemini().models.get({ model });
        return { model, ok: Boolean(m.name) };
      }),
    );
    return Response.json({ ok: checks.every((c) => c.ok), checks });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

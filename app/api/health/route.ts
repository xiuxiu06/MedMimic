import { gemini } from "@/lib/gemini";
import { MODELS } from "@/lib/models";

// GET /api/health — confirms the deploy is up and the Gemini key works.
export async function GET() {
  try {
    const res = await gemini().models.generateContent({
      model: MODELS.classifier,
      contents: "Reply with exactly: ok",
    });
    return Response.json({ ok: true, model: MODELS.classifier, reply: res.text?.trim() });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

import "server-only";

/**
 * Small fixed-window rate limiter for the Gemini-backed routes, so a public demo URL can't
 * burn the API key. In-memory: per server instance (good enough for a hackathon deploy).
 * Limits are generous so a real encounter or demo never hits them.
 */
const LIMITS = {
  turn: { max: 90, windowMs: 60_000 },
  liveToken: { max: 12, windowMs: 60_000 },
  generate: { max: 8, windowMs: 10 * 60_000 },
  debrief: { max: 30, windowMs: 60_000 },
} as const;

export type RateLimitBucket = keyof typeof LIMITS;

const hits = new Map<string, { count: number; resetAt: number }>();

function clientKey(request: Request, bucket: RateLimitBucket, userId?: string | null) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local";
  return `${bucket}:${userId ?? ip}`;
}

/** Returns a 429 Response when over the limit, otherwise null. */
export function rateLimit(
  request: Request,
  bucket: RateLimitBucket,
  userId?: string | null,
): Response | null {
  const { max, windowMs } = LIMITS[bucket];
  const key = clientKey(request, bucket, userId);
  const now = Date.now();

  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }

  const entry = hits.get(key);
  if (!entry || entry.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  entry.count += 1;
  if (entry.count <= max) return null;

  const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
  return Response.json(
    { ok: false, error: `Too many requests. Try again in ${retryAfter}s.` },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}

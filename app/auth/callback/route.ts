import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../lib/supabase/server";

/**
 * GET /auth/callback
 * Exchanges Supabase PKCE auth codes (email confirmation, magic link, OAuth)
 * for a persistent SSR cookie session. Respects Vercel `x-forwarded-host` headers.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? "/briefing";
  const nextPath = rawNext.startsWith("/") ? rawNext : "/briefing";

  const forwardedHost = request.headers.get("x-forwarded-host");
  const isLocal = process.env.NODE_ENV === "development";
  const baseUrl =
    !isLocal && forwardedHost ? `https://${forwardedHost}` : origin;

  const supabase = await getSupabaseServerClient();
  if (code && supabase) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      await supabase
        .from("profiles")
        .upsert(
          {
            id: data.user.id,
            email: data.user.email ?? null,
            last_login_at: new Date().toISOString(),
          },
          { onConflict: "id" },
        );
      return NextResponse.redirect(`${baseUrl}${nextPath}`);
    }
  }

  return NextResponse.redirect(`${baseUrl}/login?error=auth_callback_failed`);
}

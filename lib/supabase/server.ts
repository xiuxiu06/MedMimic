import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getIdToken } from "@/lib/auth/currentUser";
import { getSupabasePublicConfig } from "./config";

/**
 * Request-scoped Supabase client for Route Handlers (Auth0 branch).
 *
 * Signed in: every request carries the user's **Auth0 ID token**. Supabase trusts it through
 * Third-Party Auth (Dashboard → Authentication → Third-Party Auth → Auth0), and RLS policies read
 * `auth.jwt()->>'sub'`. Guests: no token, so the client runs as `anon` (published scenarios only).
 */
export async function getSupabaseServerClient(): Promise<SupabaseClient | null> {
  const cfg = getSupabasePublicConfig();
  if (!cfg) return null;

  const idToken = await getIdToken();

  return createClient(cfg.url, cfg.anonKey, {
    // Third-party auth: hand Supabase the Auth0 JWT instead of a Supabase Auth session.
    ...(idToken ? { accessToken: async () => idToken } : {}),
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

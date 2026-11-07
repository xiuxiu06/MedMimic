import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getSupabasePublicConfig } from "./config";

/**
 * Creates a request-scoped Supabase server client for Next.js App Router
 * Route Handlers and Server Components (Vercel Serverless compatible).
 */
export async function getSupabaseServerClient(): Promise<SupabaseClient | null> {
  const cfg = getSupabasePublicConfig();
  if (!cfg) return null;

  const cookieStore = await cookies();

  return createServerClient(cfg.url, cfg.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component where mutating cookies is a no-op;
          // Route Handlers (/auth/callback, /api/*) persist refreshed cookies.
        }
      },
    },
  });
}

"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "./config";

let browserClient: SupabaseClient | null = null;

/**
 * Singleton Supabase browser client for Client Components.
 * Returns `null` if `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
 * have not been configured yet so local/guest demo mode continues uninterrupted.
 */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  const cfg = getSupabasePublicConfig();
  if (!cfg) return null;

  if (!browserClient) {
    browserClient = createBrowserClient(cfg.url, cfg.anonKey);
  }
  return browserClient;
}

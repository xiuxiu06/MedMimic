export interface SupabasePublicConfig {
  url: string;
  anonKey: string;
}

/**
 * Reads public Supabase credentials, supporting both the classic
 * `NEXT_PUBLIC_SUPABASE_ANON_KEY` and Vercel/Supabase Marketplace's newer
 * `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` variable name.
 */
export function getSupabasePublicConfig(): SupabasePublicConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    "";

  if (!url || !anonKey) {
    return null;
  }

  return { url, anonKey };
}

export function isSupabaseConfigured(): boolean {
  return getSupabasePublicConfig() !== null;
}

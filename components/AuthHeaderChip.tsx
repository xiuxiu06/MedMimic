"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "../lib/supabase/client";

export function AuthHeaderChip() {
  const [label, setLabel] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      queueMicrotask(() => setReady(true));
      return;
    }

    let mounted = true;

    void supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      const user = data.user;
      if (user) {
        const display =
          (user.user_metadata?.display_name as string | undefined)?.trim() ||
          user.email?.split("@")[0] ||
          "Account";
        setLabel(display);
      } else {
        setLabel(null);
      }
      setReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user;
      if (user) {
        const display =
          (user.user_metadata?.display_name as string | undefined)?.trim() ||
          user.email?.split("@")[0] ||
          "Account";
        setLabel(display);
      } else {
        setLabel(null);
      }
      setReady(true);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (!ready) {
    return (
      <Link
        href="/login"
        className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line-2 bg-panel px-3.5 py-1.5 text-xs font-semibold text-fg-2 hover:bg-chip hover:text-fg transition-colors"
      >
        Sign in
      </Link>
    );
  }

  if (label) {
    return (
      <Link
        href="/login"
        title="View saved encounters, profile & patient cases"
        className="inline-flex min-h-9 items-center gap-2 rounded-full border border-ok-line bg-ok-bg px-3.5 py-1.5 text-xs font-semibold text-ok-fg hover:brightness-110 transition-all"
      >
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-ok text-[10px] font-bold text-[#062012]">
          {label.charAt(0).toUpperCase()}
        </span>
        <span className="max-w-[120px] truncate">{label}</span>
      </Link>
    );
  }

  return (
    <Link
      href="/login"
      className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line-2 bg-panel px-3.5 py-1.5 text-xs font-semibold text-fg-2 hover:bg-chip hover:text-fg transition-colors"
    >
      Sign in
    </Link>
  );
}

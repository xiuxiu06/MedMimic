"use client";

import { useUser } from "@auth0/nextjs-auth0";
import Link from "next/link";

const ROLES_CLAIM = "https://medmimic.app/roles"; // same as lib/auth0.ts ROLES_CLAIM

const chipBase =
  "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors";

/** Header account chip (Auth0). Guests see "Sign in"; nothing in the app requires login. */
export function AuthHeaderChip() {
  const { user, isLoading } = useUser();

  if (isLoading || !user) {
    return (
      // Plain <a>: a prefetched /auth/login can start a login flow.
      <a
        href="/auth/login?returnTo=/login"
        className={`${chipBase} border-line-2 bg-panel text-fg-2 hover:bg-chip hover:text-fg`}
      >
        Sign in
      </a>
    );
  }

  const label = user.name?.trim() || user.email?.split("@")[0] || "Account";
  const roles = user[ROLES_CLAIM];
  const isInstructor = Array.isArray(roles) && roles.includes("instructor");

  return (
    <span className="inline-flex items-center gap-1.5">
      <Link
        href="/login"
        title="Saved encounters, profile & patient cases"
        className={`${chipBase} border-ok-line bg-ok-bg text-ok-fg hover:brightness-110`}
      >
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-ok text-[10px] font-bold text-[#062012]">
          {label.charAt(0).toUpperCase()}
        </span>
        <span className="max-w-[120px] truncate">{label}</span>
        {isInstructor && (
          <span className="rounded-full bg-cite-bg px-1.5 text-[10px] text-cite">Instructor</span>
        )}
      </Link>
      <a
        href="/auth/logout"
        className={`${chipBase} border-line-2 bg-panel text-muted hover:bg-chip hover:text-fg`}
      >
        Sign out
      </a>
    </span>
  );
}

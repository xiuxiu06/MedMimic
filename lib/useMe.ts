"use client";

import { useEffect, useState } from "react";

export interface MeResponse {
  auth0Configured: boolean;
  user: {
    name: string | null;
    email: string | null;
    roles: string[];
    isInstructor: boolean;
  } | null;
  canGenerateCases: boolean;
}

let cached: Promise<MeResponse | null> | null = null;

function fetchMe(): Promise<MeResponse | null> {
  if (!cached) {
    cached = fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<MeResponse>) : null))
      .catch(() => null);
  }
  return cached;
}

/** Current user + role for UI gating (null while loading or on error). */
export function useMe(): MeResponse | null {
  const [me, setMe] = useState<MeResponse | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchMe().then((value) => {
      if (alive) setMe(value);
    });
    return () => {
      alive = false;
    };
  }, []);
  return me;
}

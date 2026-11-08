import "server-only";
import { auth0, ROLES_CLAIM } from "@/lib/auth0";

export type AppRole = "student" | "instructor";

export interface CurrentUser {
  /** Auth0 user id (`sub`), e.g. "google-oauth2|1234". Used as profiles.id / user_id in Postgres. */
  id: string;
  email: string | null;
  name: string | null;
  picture: string | null;
  roles: AppRole[];
  isInstructor: boolean;
  /** Shape-compatible with the old Supabase `user.user_metadata.display_name` usage. */
  user_metadata: { display_name?: string };
}

/** The signed-in Auth0 user, or null for guests. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (!auth0) return null; // Auth0 not configured → guest
  const session = await auth0.getSession();
  if (!session?.user?.sub) return null;

  const u = session.user;
  const rawRoles = u[ROLES_CLAIM];
  const roles = (Array.isArray(rawRoles) ? rawRoles : []).filter(
    (r): r is AppRole => r === "student" || r === "instructor",
  );
  const name = typeof u.name === "string" ? u.name : null;

  return {
    id: u.sub,
    email: typeof u.email === "string" ? u.email : null,
    name,
    picture: typeof u.picture === "string" ? u.picture : null,
    roles: roles.length ? roles : ["student"],
    isInstructor: roles.includes("instructor"),
    user_metadata: { display_name: name ?? undefined },
  };
}

/**
 * The Auth0 ID token for the current session. Supabase verifies it (Third-Party Auth)
 * and reads its `role: "authenticated"` claim, set by the Post-Login Action.
 */
export async function getIdToken(): Promise<string | null> {
  if (!auth0) return null;
  const session = await auth0.getSession();
  return session?.tokenSet?.idToken ?? null;
}

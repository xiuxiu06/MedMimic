import { Auth0Client, filterDefaultIdTokenClaims } from "@auth0/nextjs-auth0/server";

/** Namespaced custom claim set by the Auth0 Post-Login Action (see supabase/auth0/ACTION.js). */
export const ROLES_CLAIM = "https://medmimic.app/roles";

/**
 * Auth0 is optional at runtime: if these env vars are missing, the app runs in guest mode
 * (no login) instead of failing every request.
 */
export const isAuth0Configured = Boolean(
  process.env.AUTH0_DOMAIN &&
    process.env.AUTH0_CLIENT_ID &&
    process.env.AUTH0_CLIENT_SECRET &&
    process.env.AUTH0_SECRET,
);

/**
 * Auth0 client (reads AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, AUTH0_SECRET,
 * APP_BASE_URL). Routes mounted by proxy.ts: /auth/login, /auth/logout, /auth/callback,
 * /auth/profile. `null` when Auth0 isn't configured.
 */
export const auth0: Auth0Client | null = isAuth0Configured
  ? new Auth0Client({
      signInReturnToPath: "/login",
      // Without this hook the SDK keeps only standard claims (filterDefaultIdTokenClaims),
      // which silently drops our roles claim → isInstructor would always be false.
      async beforeSessionSaved(session) {
        const roles = session.user[ROLES_CLAIM];
        return {
          ...session,
          user: {
            ...filterDefaultIdTokenClaims(session.user),
            [ROLES_CLAIM]: Array.isArray(roles) ? roles : [],
          },
        };
      },
      // Supabase verifies the stored Auth0 ID token, which lives 10h (tenant setting) and is
      // not refreshed. Cap the app session at the same 10h so a signed-in user never ends up
      // with an expired token (silently failing cloud sync).
      session: {
        rolling: true,
        absoluteDuration: 60 * 60 * 10,
        inactivityDuration: 60 * 60 * 10,
      },
      authorizationParameters: {
        // openid + profile + email are needed for the ID token we pass to Supabase.
        scope: "openid profile email",
      },
    })
  : null;

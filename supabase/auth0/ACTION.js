/**
 * Auth0 Post-Login Action for MedMimic.
 * Auth0 Dashboard → Actions → Library → Build Custom → Trigger "Login / Post Login"
 * → paste this → Deploy → Actions → Triggers → post-login → drag it into the flow.
 *
 * 1. Supabase Third-Party Auth needs the literal claim `role: "authenticated"` on the
 *    ID TOKEN (Auth0 strips non-namespaced claims from access tokens).
 * 2. App roles (student / instructor) come from Auth0 RBAC (User Management → Roles),
 *    exposed as the namespaced claim https://medmimic.app/roles. Postgres reads it in
 *    public.is_instructor().
 * 3. Instructors must use MFA.
 */
exports.onExecutePostLogin = async (event, api) => {
  const ROLES_CLAIM = "https://medmimic.app/roles";

  const assigned = (event.authorization && event.authorization.roles) || [];
  const roles = assigned.length > 0 ? assigned : ["student"];

  // Required by Supabase to run queries as the `authenticated` Postgres role.
  api.idToken.setCustomClaim("role", "authenticated");
  api.idToken.setCustomClaim(ROLES_CLAIM, roles);

  // Instructors can read class data and generate AI cases, so require a second factor.
  if (roles.includes("instructor")) {
    api.multifactor.enable("any", { allowRememberBrowser: true });
  }
};

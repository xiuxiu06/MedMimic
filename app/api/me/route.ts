import { getCurrentUser } from "../../../lib/auth/currentUser";
import { isAuth0Configured } from "../../../lib/auth0";

/**
 * GET /api/me — who is using the app, for client UI decisions only.
 * The real checks live on the server routes (and in Postgres RLS).
 */
export async function GET() {
  const user = await getCurrentUser();
  return Response.json({
    auth0Configured: isAuth0Configured,
    user: user
      ? {
          name: user.name,
          email: user.email,
          roles: user.roles,
          isInstructor: user.isInstructor,
        }
      : null,
    /** Without Auth0 (local dev), nobody can be an instructor, so generation stays open. */
    canGenerateCases: !isAuth0Configured || Boolean(user?.isInstructor),
  });
}

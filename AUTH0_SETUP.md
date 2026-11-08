# Auth0 setup (branch `b/s8-auth0`)

`main` keeps Supabase Auth. This branch switches login to **Auth0** while keeping **Supabase as the database**, linked by Supabase **Third-Party Auth**.
Without Auth0 env vars, the app still runs in guest mode, so nothing breaks before you finish these steps.

```
Browser ─/auth/login─► Auth0 (Google · passwordless · MFA for instructors)
                         Post-Login Action → ID token gets
                           role: "authenticated"   (Supabase needs this)
                           https://medmimic.app/roles: ["student" | "instructor"]
Next.js server: auth0.getSession() → idToken → Supabase client { accessToken }
Postgres RLS: auth.jwt()->>'sub' (+ is_instructor())
```

## 1. Auth0 application (~10 min)
1. Go to https://manage.auth0.com. Create a tenant if asked (any region).
2. **Applications → Create Application** → name it `MedMimic` → choose **Regular Web Applications**.
3. In **Settings**:
   - **Allowed Callback URLs:** `http://localhost:3000/auth/callback, https://<your-prod>.vercel.app/auth/callback`
   - **Allowed Logout URLs:** `http://localhost:3000, https://<your-prod>.vercel.app`
   - **Allowed Web Origins:** `http://localhost:3000, https://<your-prod>.vercel.app`
   - **Advanced Settings → OAuth → JSON Web Token Signature Algorithm** must be **RS256**, the default. Supabase does not accept HS256.
   - Save.
4. Copy the **Domain**, **Client ID** and **Client Secret**.

## 2. Login methods (~5 min)
- **Authentication → Social:** enable **Google** (dev keys are fine for a hackathon) and turn it on for the MedMimic app.
- **Authentication → Passwordless → Email:** enable it and turn it on for the app. Users get a one-time code.
- **Security → Multi-factor Auth:** enable **One-time Password** (authenticator app). Leave the policy at "Never"; the Action below requires MFA only for instructors.

## 3. Roles (~5 min)
1. **User Management → Roles:** create `student` and `instructor`.
2. Sign in to the app once (step 7), then **User Management → Users** → your user → **Roles** → assign `instructor`. Leave a second test account without roles; it becomes a `student`.

## 4. Post-Login Action (~5 min)
1. **Actions → Library → Build Custom** → name `medmimic-claims`, trigger **Login / Post Login**.
2. Paste `supabase/auth0/ACTION.js` → **Deploy**.
3. **Actions → Triggers → post-login** → drag `medmimic-claims` into the flow → **Apply**.

## 5. Supabase (~5 min)
1. Dashboard → **Authentication → Sign In / Providers → Third-Party Auth** (or `/dashboard/project/aparubjawzdfkpspvqzm/auth/third-party`) → **Add provider → Auth0**. Enter your **tenant ID**: the part before `.auth0.com` in the domain, plus the region if your domain has one (e.g. `us`).
2. **SQL Editor:** run `supabase/auth0-migration.sql` once.
   - It changes user ids to text and rewrites the RLS rules to use the JWT `sub` and the instructor role.
   - It works for both `main` (Supabase Auth) and this branch, so running it is safe even before merging.

## 6. Environment variables
`.env.local` (and the same names on Vercel → Settings → Environment Variables):
```
AUTH0_DOMAIN=your-tenant.us.auth0.com
AUTH0_CLIENT_ID=...
AUTH0_CLIENT_SECRET=...
AUTH0_SECRET=<run: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
APP_BASE_URL=http://localhost:3000        # on Vercel: https://<your-prod>.vercel.app
```
Restart `npm run dev` after editing `.env.local`.

## 7. Test checklist
| Test | Expected |
|---|---|
| Header → **Sign in** → Google or email code | Returns to `/login` with your name; the chip shows your initial |
| Database check (ask Claude "check") | `profiles` has a row whose id looks like `google-oauth2\|…` |
| Play Jordan → End encounter (signed in) | Rows appear in `encounter_sessions` / `encounter_branches` with your Auth0 id |
| `/login` as a **student** | History shows; the AI case generator shows "Instructor only" |
| `/login` as an **instructor** (after MFA) | "Instructor" badge; the AI case generator works |
| Student calls `POST /api/scenarios` with `generatePrompt` | 403 |
| **Continue as Guest** → full Jordan demo | Works with no login anywhere |
| Header → **Sign out** | Back to guest |

## What changed in code (this branch only)
- **New:**
  - `lib/auth0.ts`: Auth0 client; `null` when not configured
  - `proxy.ts`: mounts `/auth/*`; passes requests through when Auth0 isn't configured
  - `lib/auth/currentUser.ts`: `getCurrentUser()` returning `{ id: sub, email, name, roles, isInstructor }`, and `getIdToken()`
  - `supabase/auth0-migration.sql`, `supabase/auth0/ACTION.js`
- **`lib/supabase/server.ts`:** the Supabase client sends the Auth0 ID token (`accessToken` option) instead of Supabase cookies.
- **`app/api/sessions`, `app/api/scenarios`:** `supabase.auth.getUser()` → `getCurrentUser()`. AI case generation and publishing are **instructor-only** (403 otherwise; also enforced by RLS).
- **`app/login`:** the email/password and magic-link form is replaced by "Sign in with Auth0" and "Create a learner account" (plus guest). The history dashboard is unchanged. The AI generator is shown only to instructors.
- **`components/AuthHeaderChip.tsx`:** uses Auth0 `useUser()`, with an Instructor badge and Sign out.
- **Removed:** `app/auth/callback` (Auth0 owns `/auth/callback`), `lib/supabase/client.ts`, and the `@supabase/ssr` dependency.

## Pitch for "Best Use of Auth0"
> Auth0 secures who can do what in an AI training tool. Students sign in with Google or a passwordless code. Instructors are assigned through Auth0 RBAC and must use MFA. Only instructors can use the Gemini case generator or publish cases, and Postgres RLS enforces the Auth0 role from the verified token, so the rule holds even if someone calls the API directly.

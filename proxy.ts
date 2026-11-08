import { NextResponse } from "next/server";
import { auth0 } from "./lib/auth0";

// Next.js 16 "proxy" (formerly middleware). Mounts Auth0's /auth/* routes and keeps the
// session rolling. It does NOT require login for any page: guests can use the whole app.
// If Auth0 isn't configured (env vars missing), it passes every request through untouched.
export async function proxy(request: Request) {
  if (!auth0) return NextResponse.next();
  return await auth0.middleware(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|sitemap.xml|robots.txt).*)"],
};

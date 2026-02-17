import NextAuth from "next-auth";

import { authConfig } from "@/lib/auth.config";

// Use the Edge-safe config (no DB imports) for middleware.
// This only checks for a valid JWT — it doesn't call authorize().
export default NextAuth(authConfig).auth;

export const config = {
  matcher: [
    // Run middleware on all routes EXCEPT:
    // - /api/auth/* (Auth.js endpoints)
    // - /_next/* (Next.js internals)
    // - /icons/* (public static icons)
    // - /favicon.ico, /robots.txt, static files with extensions
    "/((?!api/auth|_next/static|_next/image|icons|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

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
    // - /favicon.ico, /robots.txt, etc.
    "/((?!api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};

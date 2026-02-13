import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe auth configuration (no DB imports).
 * Used by middleware to check authentication without importing Prisma/pg.
 * Full provider config lives in auth.ts.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isAuthPage =
        nextUrl.pathname.startsWith("/login") ||
        nextUrl.pathname.startsWith("/signup");

      // Public API routes (no auth required for reads)
      const isPublicApi =
        nextUrl.pathname.startsWith("/api/catalog");

      // Redirect logged-in users away from auth pages
      if (isAuthPage) {
        if (isLoggedIn) {
          return Response.redirect(new URL("/", nextUrl));
        }
        return true;
      }

      // Allow public API access (auth checked in route handlers for writes)
      if (isPublicApi) {
        return true;
      }

      // Protect all other routes
      return isLoggedIn;
    },
  },
  providers: [], // Providers added in auth.ts — empty here for Edge compat
} satisfies NextAuthConfig;

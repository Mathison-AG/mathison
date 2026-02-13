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

      // Redirect logged-in users away from auth pages
      if (isAuthPage) {
        if (isLoggedIn) {
          return Response.redirect(new URL("/", nextUrl));
        }
        return true;
      }

      // Protect all other routes
      return isLoggedIn;
    },
  },
  providers: [], // Providers added in auth.ts — empty here for Edge compat
} satisfies NextAuthConfig;

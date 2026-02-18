import { NextResponse } from "next/server";

/**
 * GET handler that clears auth session cookies and redirects to /login.
 * Used as an escape hatch when a user has a stale JWT but no valid DB record
 * (e.g., after a database reset). The middleware can't check the DB (Edge runtime),
 * so server layouts redirect here when they detect an orphaned session.
 */
export async function GET(req: Request) {
  const loginUrl = new URL("/login", req.url);
  const response = NextResponse.redirect(loginUrl);

  const cookieNames = [
    "authjs.session-token",
    "authjs.callback-url",
    "authjs.csrf-token",
    "__Secure-authjs.session-token",
    "__Secure-authjs.callback-url",
    "__Secure-authjs.csrf-token",
  ];

  for (const name of cookieNames) {
    response.cookies.delete(name);
  }

  return response;
}

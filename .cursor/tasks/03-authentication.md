# Step 03 — Authentication (Auth.js v5)

## Goal

Implement full authentication with Auth.js v5 (NextAuth): credentials provider (email + password), login/signup pages, and automatic tenant + K8s namespace creation on signup. After this step, users can register, log in, and have a tenant assigned.

## Prerequisites

- Steps 01–02 completed (project scaffolded, database with all models migrated)
- `.env.local` has `AUTH_SECRET` set (generate with `npx auth secret`)

## What to Build

### 1. Auth.js Configuration (`src/lib/auth.ts`)

Set up Auth.js v5 with:
- **Credentials provider**: email + password (bcrypt hash verification)
- **Session strategy**: JWT (stateless, no DB sessions needed for MVP)
- **Callbacks**:
  - `jwt` callback: attach `userId`, `tenantId`, `role` to the JWT token
  - `session` callback: expose `userId`, `tenantId`, `role` on the session object
- **Pages**: custom login page at `/login`

```typescript
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./db";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        // 1. Validate credentials with Zod
        // 2. Find user by email
        // 3. Verify password with bcrypt
        // 4. Return user object with id, email, name, tenantId, role
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) { /* attach tenantId, role */ },
    session({ session, token }) { /* expose tenantId, role */ },
  },
  pages: {
    signIn: "/login",
  },
});
```

### 2. Auth Route Handler (`src/app/api/auth/[...nextauth]/route.ts`)

```typescript
import { handlers } from "@/lib/auth";
export const { GET, POST } = handlers;
```

### 3. Signup API Route (`src/app/api/auth/signup/route.ts`)

POST endpoint that:
1. Validates input (email, password, name, workspace name) with Zod
2. Checks if email already exists
3. Hashes password with bcrypt (salt rounds: 12)
4. Creates Tenant (slug derived from workspace name, namespace = `tenant-{slug}`)
5. Creates User linked to the new Tenant with role=ADMIN
6. Returns success (does NOT auto-login — redirect to login page)

### 4. Auth Pages

**Login page** (`src/app/(auth)/login/page.tsx`):
- Clean, centered card layout
- Email + password form
- Submit calls `signIn("credentials", { email, password, redirectTo: "/" })`
- Link to signup page
- Show error messages on failed login

**Signup page** (`src/app/(auth)/signup/page.tsx`):
- Email + password + name + workspace name fields
- POST to `/api/auth/signup`, then redirect to `/login` on success
- Client-side validation with Zod
- Show error messages

**Auth layout** (`src/app/(auth)/layout.tsx`):
- Centered card layout (no sidebar, minimal branding)
- Just a container div centered on screen

### 5. Middleware (`src/middleware.ts`)

Protect all routes except auth routes:

```typescript
export { auth as middleware } from "@/lib/auth";

export const config = {
  matcher: ["/((?!api/auth|login|signup|_next/static|_next/image|favicon.ico).*)"],
};
```

### 6. TypeScript — Extend Auth.js Types

Extend the session type to include `tenantId` and `role`:

```typescript
// src/types/next-auth.d.ts
import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      tenantId: string;
      role: "ADMIN" | "USER";
    } & DefaultSession["user"];
  }
}
```

### 7. Additional Dependency

```bash
npm install bcryptjs
npm install -D @types/bcryptjs
```

## Deliverables

- [ ] `/signup` page renders, creates user + tenant in DB, redirects to `/login`
- [ ] `/login` page renders, authenticates with credentials, redirects to `/`
- [ ] Unauthenticated users are redirected to `/login`
- [ ] Session contains `userId`, `tenantId`, `role`
- [ ] `auth()` helper works in Server Components and API routes
- [ ] Tenant slug and namespace are generated from workspace name
- [ ] Passwords are hashed with bcrypt (never stored in plain text)
- [ ] Both pages use shadcn/ui components and look clean

## Key Files

```
src/
├── lib/
│   └── auth.ts
├── app/
│   ├── api/auth/
│   │   ├── [...nextauth]/route.ts
│   │   └── signup/route.ts
│   └── (auth)/
│       ├── layout.tsx
│       ├── login/page.tsx
│       └── signup/page.tsx
├── middleware.ts
└── types/
    └── next-auth.d.ts
```

## Notes

- For the MVP, K8s namespace creation during signup is optional (can be a placeholder that logs instead of calling K8s API). The actual K8s namespace creation will be fully wired in Step 06.
- Use `bcryptjs` (pure JS) instead of `bcrypt` (native addon) to avoid build issues.
- The signup endpoint does NOT auto-login. This is intentional — redirect to login after signup.
- Auth.js v5 uses the `auth()` function everywhere (not `getServerSession`).
- No OAuth/OIDC providers in MVP — just credentials.

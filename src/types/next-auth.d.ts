import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    tenantId?: string;
    role?: "ADMIN" | "USER";
  }

  interface Session {
    user: {
      id: string;
      tenantId: string;
      role: "ADMIN" | "USER";
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    tenantId?: string;
    role?: "ADMIN" | "USER";
  }
}

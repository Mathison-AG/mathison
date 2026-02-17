import Link from "next/link";
import { Boxes } from "lucide-react";

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="relative flex min-h-screen">
      {/* Left side — form */}
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <div className="w-full max-w-md space-y-8">
          {/* Branding */}
          <div className="flex flex-col items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Boxes className="size-5" />
              </div>
              <span className="text-xl font-bold tracking-tight">Mathison</span>
            </Link>
          </div>

          {/* Form content */}
          {children}
        </div>
      </div>

      {/* Right side — decorative (hidden on mobile) */}
      <div className="hidden lg:flex lg:flex-1 lg:items-center lg:justify-center relative overflow-hidden bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5">
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border)_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-30" />

        {/* Content */}
        <div className="relative z-10 max-w-md px-8 text-center space-y-6">
          <div className="mx-auto flex size-20 items-center justify-center rounded-3xl bg-primary/10">
            <Boxes className="size-10 text-primary" />
          </div>
          <div className="space-y-3">
            <h2 className="text-2xl font-bold tracking-tight">
              Your apps, your way
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Run powerful open-source tools without the technical hassle.
              Install apps in one click and manage everything from a single dashboard.
            </p>
          </div>

          {/* App icon showcase */}
          <div className="flex items-center justify-center gap-3 pt-4">
            {["n8n", "postgresql", "redis", "uptime-kuma", "minio"].map(
              (slug) => (
                <div
                  key={slug}
                  className="flex size-12 items-center justify-center rounded-xl border bg-background/80 shadow-sm backdrop-blur-sm"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/icons/${slug}.svg`}
                    alt={slug}
                    width={24}
                    height={24}
                    className="size-6"
                  />
                </div>
              )
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            n8n &middot; PostgreSQL &middot; Redis &middot; Uptime Kuma &middot; MinIO and more
          </p>
        </div>
      </div>
    </div>
  );
}

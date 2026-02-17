"use client";

import { useEffect } from "react";
import { AlertCircle, RefreshCw, Home } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function MyAppsError({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error("[MyAppsError]", error);
  }, [error]);
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="text-center space-y-4 max-w-md">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-muted">
          <AlertCircle className="size-7 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">
            Couldn&apos;t load your apps
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Something went wrong on our end. Please try again in a moment.
          </p>
        </div>
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" onClick={reset}>
            <RefreshCw className="mr-1.5 size-4" />
            Try again
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/">
              <Home className="mr-1.5 size-4" />
              App Store
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

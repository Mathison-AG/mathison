"use client";

import Link from "next/link";
import { CheckCircle2, ExternalLink, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";

interface InstallSuccessProps {
  appName: string;
  appUrl: string | null;
  gettingStarted: string | null;
}

export function InstallSuccess({
  appName,
  appUrl,
  gettingStarted,
}: InstallSuccessProps) {
  return (
    <div className="rounded-xl border bg-card p-6 space-y-5">
      {/* Success header */}
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-full bg-green-500/10">
          <CheckCircle2 className="size-5 text-green-500" />
        </div>
        <div>
          <h3 className="font-semibold">{appName} is ready!</h3>
          <p className="text-sm text-muted-foreground">
            Your app has been installed and is running.
          </p>
        </div>
      </div>

      {/* Open app button */}
      {appUrl && (
        <a href={appUrl} target="_blank" rel="noopener noreferrer">
          <Button size="lg" className="w-full rounded-xl">
            Open {appName}
            <ExternalLink className="size-4" />
          </Button>
        </a>
      )}

      {/* Getting started content */}
      {gettingStarted && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">
            Getting started
          </h4>
          <div className="text-sm text-foreground/80 space-y-1">
            {gettingStarted.split("\n").map((line, i) => {
              if (line.trim() === "") return null;
              if (line.startsWith("## ") || line.startsWith("### ")) {
                return (
                  <p key={i} className="font-medium mt-2">
                    {line.replace(/^#{2,3}\s/, "")}
                  </p>
                );
              }
              if (line.match(/^\d+\.\s/)) {
                return (
                  <p key={i} className="ml-1">
                    {line}
                  </p>
                );
              }
              if (line.startsWith("- ") || line.startsWith("* ")) {
                return (
                  <p key={i} className="ml-3">
                    &bull; {line.replace(/^[-*]\s/, "")}
                  </p>
                );
              }
              return (
                <p key={i}>{line}</p>
              );
            })}
          </div>
        </div>
      )}

      {/* Link to My Apps */}
      <Link href="/apps">
        <Button variant="outline" className="w-full rounded-xl">
          My Apps
          <ArrowRight className="size-4" />
        </Button>
      </Link>
    </div>
  );
}

"use client";

import Link from "next/link";
import { AppWindow, Plus, Store } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MyAppCard } from "./app-card";
import { useMyApps } from "@/hooks/use-my-apps";

// ─── Loading skeleton ────────────────────────────────────

function AppGridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col items-center gap-2.5 rounded-xl border p-4 sm:gap-3 sm:p-6"
        >
          <Skeleton className="size-14 sm:size-16 rounded-2xl" />
          <div className="space-y-1.5 w-full flex flex-col items-center">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-4 w-20" />
          <div className="flex gap-2 w-full pt-1">
            <Skeleton className="h-8 flex-1 rounded-md" />
            <Skeleton className="size-8 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Empty state ─────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex min-h-[400px] items-center justify-center rounded-xl border border-dashed">
      <div className="text-center space-y-4 max-w-sm">
        <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-primary/10">
          <AppWindow className="size-8 text-primary" />
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">
            You haven&apos;t installed any apps yet
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Browse the App Store to find something useful. Install any app in
            one click — no technical knowledge required.
          </p>
        </div>
        <Button asChild size="lg">
          <Link href="/">
            <Store className="mr-2 size-4" />
            Browse Apps
          </Link>
        </Button>
      </div>
    </div>
  );
}

// ─── Grid component ──────────────────────────────────────

export function AppGrid() {
  const { data: apps, isLoading } = useMyApps();

  if (isLoading) return <AppGridSkeleton />;
  if (!apps || apps.length === 0) return <EmptyState />;

  // Sort: running first, then transitional, then others
  const sorted = [...apps].sort((a, b) => {
    const order: Record<string, number> = {
      RUNNING: 0,
      DEPLOYING: 1,
      PENDING: 1,
      FAILED: 2,
      DELETING: 3,
      STOPPED: 4
    };
    return (order[a.status] ?? 5) - (order[b.status] ?? 5);
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {apps.length} {apps.length === 1 ? "app" : "apps"} installed
        </p>
        <Button variant="outline" size="sm" asChild>
          <Link href="/">
            <Plus className="mr-1.5 size-3.5" />
            Add App
          </Link>
        </Button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
        {sorted.map((app) => (
          <MyAppCard key={app.id} app={app} />
        ))}
      </div>
    </div>
  );
}

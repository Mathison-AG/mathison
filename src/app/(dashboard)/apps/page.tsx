"use client";

import { AppWindow } from "lucide-react";

import { AppGrid } from "@/components/my-apps/app-grid";

export default function MyAppsPage() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <AppWindow className="size-6 text-muted-foreground" />
        <div>
          <h2 className="text-2xl font-bold tracking-tight">My Apps</h2>
          <p className="text-muted-foreground">
            Your installed apps, all in one place.
          </p>
        </div>
      </div>

      {/* Grid */}
      <AppGrid />
    </div>
  );
}

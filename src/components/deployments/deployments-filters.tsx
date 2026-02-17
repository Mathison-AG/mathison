"use client";

import { cn } from "@/lib/utils";

// ─── Status filters ───────────────────────────────────────

const statuses = [
  { value: "all", label: "All" },
  { value: "RUNNING", label: "Running" },
  { value: "DEPLOYING", label: "Installing" },
  { value: "PENDING", label: "Pending" },
  { value: "FAILED", label: "Failed" },
  { value: "STOPPED", label: "Stopped" }
] as const;

// ─── Component ────────────────────────────────────────────

interface DeploymentsFiltersProps {
  status: string;
  onStatusChange: (value: string) => void;
}

export function DeploymentsFilters({
  status,
  onStatusChange
}: DeploymentsFiltersProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {statuses.map((s) => (
        <button
          key={s.value}
          onClick={() => onStatusChange(s.value)}
          className={cn(
            "inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium transition-colors",
            status === s.value
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background hover:bg-muted"
          )}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

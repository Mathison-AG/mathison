"use client";

import type { DeploymentStatus } from "@/generated/prisma/enums";

import { cn } from "@/lib/utils";

// ─── Status mapping ──────────────────────────────────────

interface StatusInfo {
  label: string;
  color: "green" | "yellow" | "red" | "gray";
}

const STATUS_MAP: Record<DeploymentStatus, StatusInfo> = {
  PENDING: { label: "Starting...", color: "yellow" },
  DEPLOYING: { label: "Starting...", color: "yellow" },
  RUNNING: { label: "Running", color: "green" },
  FAILED: { label: "Needs attention", color: "red" },
  STOPPED: { label: "Stopped", color: "gray" },
  DELETING: { label: "Removing...", color: "yellow" },
};

const DOT_COLORS = {
  green: "bg-green-500",
  yellow: "bg-yellow-500",
  red: "bg-red-500",
  gray: "bg-gray-400",
} as const;

const TEXT_COLORS = {
  green: "text-green-600 dark:text-green-400",
  yellow: "text-yellow-600 dark:text-yellow-400",
  red: "text-red-600 dark:text-red-400",
  gray: "text-muted-foreground",
} as const;

// ─── Component ───────────────────────────────────────────

interface StatusIndicatorProps {
  status: DeploymentStatus;
  className?: string;
}

export function StatusIndicator({ status, className }: StatusIndicatorProps) {
  const info = STATUS_MAP[status] ?? { label: status, color: "gray" as const };
  const isPulsing = info.color === "yellow";

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm", className)}>
      <span className="relative flex size-2">
        {isPulsing && (
          <span
            className={cn(
              "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
              DOT_COLORS[info.color]
            )}
          />
        )}
        <span
          className={cn(
            "relative inline-flex size-2 rounded-full",
            DOT_COLORS[info.color]
          )}
        />
      </span>
      <span className={cn("font-medium", TEXT_COLORS[info.color])}>
        {info.label}
      </span>
    </span>
  );
}

// ─── Helpers ─────────────────────────────────────────────

export function getStatusInfo(status: DeploymentStatus): StatusInfo {
  return STATUS_MAP[status] ?? { label: status, color: "gray" };
}

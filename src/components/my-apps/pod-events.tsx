"use client";

import { AlertTriangle, Info } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useDeploymentEvents } from "@/hooks/use-my-apps";

// ─── Time formatting ─────────────────────────────────────

function formatEventTime(timestamp: string | null): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);

  if (diffSecs < 60) return `${diffSecs}s ago`;
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Component ───────────────────────────────────────────

interface PodEventsProps {
  deploymentId: string;
  status: string;
}

export function PodEvents({ deploymentId, status }: PodEventsProps) {
  const { data: events } = useDeploymentEvents(deploymentId, status);

  const warnings = events?.filter((e) => e.type === "Warning") ?? [];

  if (warnings.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Recent Issues</h2>
      <Card className="divide-y divide-border overflow-hidden">
        {warnings.slice(0, 10).map((event, i) => (
          <div
            key={`${event.reason}-${event.lastTimestamp}-${i}`}
            className={cn(
              "flex items-start gap-3 px-4 py-3",
              event.type === "Warning" ? "bg-amber-500/5" : ""
            )}
          >
            <div className="mt-0.5 shrink-0">
              {event.type === "Warning" ? (
                <AlertTriangle className="size-4 text-amber-500" />
              ) : (
                <Info className="size-4 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0 space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{event.reason}</span>
                {event.count > 1 && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    x{event.count}
                  </span>
                )}
                <span className="text-xs text-muted-foreground ml-auto shrink-0">
                  {formatEventTime(event.lastTimestamp)}
                </span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed break-words">
                {event.message}
              </p>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

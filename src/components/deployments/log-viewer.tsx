"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, ArrowDown } from "lucide-react";

import { Button } from "@/components/ui/button";

// ─── Component ────────────────────────────────────────────

interface LogViewerProps {
  deploymentId: string;
}

export function LogViewer({ deploymentId }: LogViewerProps) {
  const [lines, setLines] = useState(100);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLPreElement>(null);

  const { data, isLoading, refetch, isFetching } = useQuery<{ logs: string }>({
    queryKey: ["logs", deploymentId, lines],
    queryFn: async () => {
      const res = await fetch(
        `/api/deployments/${deploymentId}/logs?lines=${lines}`
      );
      if (!res.ok) throw new Error("Failed to fetch logs");
      return res.json();
    },
    refetchInterval: 10000 // Refresh every 10s
  });

  // Auto-scroll to bottom when logs update
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [data?.logs, autoScroll]);

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Lines:</span>
          {[50, 100, 500].map((n) => (
            <button
              key={n}
              onClick={() => setLines(n)}
              className={`text-xs px-2 py-1 rounded border transition-colors ${
                lines === n
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-muted"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoScroll(!autoScroll)}
            className={autoScroll ? "text-primary" : ""}
          >
            <ArrowDown className="size-3" />
            Auto-scroll
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw
              className={`size-3 ${isFetching ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* Log output */}
      <pre
        ref={scrollRef}
        className="h-[400px] overflow-auto rounded-lg border bg-zinc-950 p-4 text-xs text-zinc-200 font-mono leading-relaxed"
      >
        {isLoading ? (
          <span className="text-zinc-500">Loading logs...</span>
        ) : data?.logs ? (
          data.logs
        ) : (
          <span className="text-zinc-500">No logs available.</span>
        )}
      </pre>
    </div>
  );
}

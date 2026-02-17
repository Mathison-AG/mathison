"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Cpu,
  MemoryStick,
  Box,
  HardDrive,
  Info,
  CheckCircle2,
  XCircle,
  RefreshCw,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import type { ClusterStats, ClusterNodeStats } from "@/lib/cluster/kubernetes";

// ─── Formatting helpers ───────────────────────────────────

function formatCpu(millis: number): string {
  if (millis >= 1000) {
    const cores = millis / 1000;
    return cores % 1 === 0 ? `${cores} cores` : `${cores.toFixed(1)} cores`;
  }
  return `${millis}m`;
}

function formatMemory(bytes: number): string {
  if (bytes === 0) return "0 B";
  const gi = bytes / (1024 ** 3);
  if (gi >= 1) return `${gi.toFixed(1)} Gi`;
  const mi = bytes / (1024 ** 2);
  if (mi >= 1) return `${mi.toFixed(0)} Mi`;
  const ki = bytes / 1024;
  return `${ki.toFixed(0)} Ki`;
}

function percent(used: number, total: number): number {
  if (total === 0) return 0;
  return Math.min(Math.round((used / total) * 100), 100);
}

function barColor(pct: number): string {
  if (pct >= 90) return "bg-red-500";
  if (pct >= 70) return "bg-amber-500";
  return "bg-emerald-500";
}

// ─── Resource bar ─────────────────────────────────────────

interface ResourceBarProps {
  label: string;
  used: number;
  total: number;
  formatFn: (v: number) => string;
}

function ResourceBar({ label, used, total, formatFn }: ResourceBarProps) {
  const pct = percent(used, total);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">
          {formatFn(used)} / {formatFn(total)}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor(pct)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-xs text-muted-foreground text-right tabular-nums">
        {pct}%
      </div>
    </div>
  );
}

// ─── Summary card ─────────────────────────────────────────

interface SummaryCardProps {
  title: string;
  icon: React.ReactNode;
  value: string;
  subtitle: string;
  pct?: number;
}

function SummaryCard({ title, icon, value, subtitle, pct }: SummaryCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardDescription>{title}</CardDescription>
          <span className="text-muted-foreground">{icon}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-2xl font-bold tabular-nums">{value}</div>
        {pct !== undefined && (
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${barColor(pct)}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

// ─── Node card ────────────────────────────────────────────

interface NodeCardProps {
  node: ClusterNodeStats;
  metricsAvailable: boolean;
}

function NodeCard({ node, metricsAvailable }: NodeCardProps) {
  const cpuUsed = metricsAvailable && node.usage
    ? node.usage.cpuMillis
    : node.allocated.cpuMillis;
  const memUsed = metricsAvailable && node.usage
    ? node.usage.memoryBytes
    : node.allocated.memoryBytes;
  const resourceLabel = metricsAvailable && node.usage ? "Usage" : "Allocated";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{node.name}</CardTitle>
          <Badge variant={node.ready ? "default" : "destructive"} className="gap-1">
            {node.ready ? (
              <CheckCircle2 className="size-3" />
            ) : (
              <XCircle className="size-3" />
            )}
            {node.ready ? "Ready" : "Not Ready"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ResourceBar
          label={`CPU ${resourceLabel}`}
          used={cpuUsed}
          total={node.allocatable.cpuMillis}
          formatFn={formatCpu}
        />
        <ResourceBar
          label={`Memory ${resourceLabel}`}
          used={memUsed}
          total={node.allocatable.memoryBytes}
          formatFn={formatMemory}
        />
        <ResourceBar
          label="Pods"
          used={node.podCount}
          total={node.allocatable.pods}
          formatFn={(v) => String(v)}
        />
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 pt-2 border-t text-xs text-muted-foreground">
          <span>Kubelet</span>
          <span className="text-right font-medium text-foreground">{node.kubeletVersion}</span>
          <span>OS</span>
          <span className="text-right font-medium text-foreground truncate" title={node.osImage}>
            {node.osImage}
          </span>
          <span>Arch</span>
          <span className="text-right font-medium text-foreground">{node.architecture}</span>
          <span>Runtime</span>
          <span className="text-right font-medium text-foreground truncate" title={node.containerRuntime}>
            {node.containerRuntime}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Metrics banner ───────────────────────────────────────

function MetricsBanner() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/50">
      <Info className="size-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
          Metrics Server not detected
        </p>
        <p className="text-sm text-blue-700 dark:text-blue-300">
          Showing allocated (requested) resources instead of real-time usage.
          Install{" "}
          <a
            href="https://github.com/kubernetes-sigs/metrics-server"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            Metrics Server
          </a>{" "}
          for live CPU and memory data.
        </p>
      </div>
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-20" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-1.5 w-full" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Error state ──────────────────────────────────────────

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="rounded-full bg-destructive/10 p-3">
        <XCircle className="size-8 text-destructive" />
      </div>
      <div className="space-y-1">
        <p className="font-medium">Failed to load cluster stats</p>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw className="size-4 mr-2" />
        Retry
      </Button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────

export function ClusterOverview() {
  const {
    data: stats,
    isLoading,
    error,
    refetch,
    dataUpdatedAt,
  } = useQuery<ClusterStats>({
    queryKey: ["cluster-stats"],
    queryFn: async () => {
      const res = await fetch("/api/cluster/stats");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
    refetchInterval: 30_000,
  });

  if (isLoading) return <LoadingSkeleton />;

  if (error) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : "Unknown error"}
        onRetry={() => refetch()}
      />
    );
  }

  if (!stats) return null;

  const { summary, nodes, metricsAvailable } = stats;

  const cpuUsed = summary.usedCpuMillis ?? summary.allocatedCpuMillis;
  const memUsed = summary.usedMemoryBytes ?? summary.allocatedMemoryBytes;
  const cpuPct = percent(cpuUsed, summary.totalCpuMillis);
  const memPct = percent(memUsed, summary.totalMemoryBytes);
  const podPct = percent(summary.totalPods, summary.podCapacity);
  const cpuLabel = metricsAvailable ? "used" : "allocated";
  const memLabel = metricsAvailable ? "used" : "allocated";

  return (
    <div className="space-y-6">
      {/* Metrics banner */}
      {!metricsAvailable && <MetricsBanner />}

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Nodes"
          icon={<HardDrive className="size-4" />}
          value={String(summary.nodeCount)}
          subtitle={`${nodes.filter((n) => n.ready).length} of ${summary.nodeCount} ready`}
        />
        <SummaryCard
          title="CPU"
          icon={<Cpu className="size-4" />}
          value={`${cpuPct}%`}
          subtitle={`${formatCpu(cpuUsed)} ${cpuLabel} of ${formatCpu(summary.totalCpuMillis)}`}
          pct={cpuPct}
        />
        <SummaryCard
          title="Memory"
          icon={<MemoryStick className="size-4" />}
          value={`${memPct}%`}
          subtitle={`${formatMemory(memUsed)} ${memLabel} of ${formatMemory(summary.totalMemoryBytes)}`}
          pct={memPct}
        />
        <SummaryCard
          title="Pods"
          icon={<Box className="size-4" />}
          value={`${summary.totalPods}`}
          subtitle={`${podPct}% of ${summary.podCapacity} capacity`}
          pct={podPct}
        />
      </div>

      {/* Node details header with refresh info */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Nodes</h3>
        <div className="flex items-center gap-2">
          {dataUpdatedAt > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-xs text-muted-foreground tabular-nums">
                  Updated {new Date(dataUpdatedAt).toLocaleTimeString()}
                </span>
              </TooltipTrigger>
              <TooltipContent>Auto-refreshes every 30 seconds</TooltipContent>
            </Tooltip>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => refetch()}
          >
            <RefreshCw className="size-4" />
            <span className="sr-only">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Node grid */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {nodes.map((node) => (
          <NodeCard
            key={node.name}
            node={node}
            metricsAvailable={metricsAvailable}
          />
        ))}
      </div>
    </div>
  );
}

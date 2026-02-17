"use client";

import { Check, Loader2, Circle } from "lucide-react";

import type { Deployment } from "@/types/deployment";

interface InstallProgressProps {
  appName: string;
  hasDeps: boolean;
  deployment: Deployment | null;
  error?: string | null;
}

interface ProgressStep {
  label: string;
  status: "done" | "active" | "pending";
}

function getProgressSteps(
  deployment: Deployment | null,
  hasDeps: boolean
): ProgressStep[] {
  const status = deployment?.status ?? "PENDING";

  const steps: ProgressStep[] = [
    { label: "Preparing environment", status: "pending" }
  ];

  if (hasDeps) {
    steps.push({
      label: "Setting up required apps",
      status: "pending"
    });
  }

  steps.push(
    { label: "Starting app", status: "pending" },
    { label: "Verifying everything works", status: "pending" }
  );

  // Update step statuses based on deployment status
  if (status === "PENDING") {
    if (steps[0]) steps[0].status = "active";
  } else if (status === "DEPLOYING") {
    if (steps[0]) steps[0].status = "done";
    if (hasDeps) {
      if (steps[1]) steps[1].status = "done";
      if (steps[2]) steps[2].status = "active";
    } else {
      if (steps[1]) steps[1].status = "active";
    }
  } else if (status === "RUNNING") {
    steps.forEach((s) => (s.status = "done"));
  } else if (status === "FAILED") {
    let foundActive = false;
    for (const step of steps) {
      if (!foundActive && step.status === "pending") {
        step.status = "active";
        foundActive = true;
      }
    }
    if (!foundActive) {
      const last = steps[steps.length - 1];
      if (last) last.status = "active";
    }
  }

  return steps;
}

function getProgressPercent(steps: ProgressStep[]): number {
  const total = steps.length;
  const done = steps.filter((s) => s.status === "done").length;
  const hasActive = steps.some((s) => s.status === "active");
  return Math.round(((done + (hasActive ? 0.5 : 0)) / total) * 100);
}

function StepIcon({ status }: { status: ProgressStep["status"] }) {
  switch (status) {
    case "done":
      return <Check className="size-4 text-green-500" />;
    case "active":
      return <Loader2 className="size-4 text-primary animate-spin" />;
    case "pending":
      return <Circle className="size-4 text-muted-foreground/40" />;
  }
}

export function InstallProgress({
  appName,
  hasDeps,
  deployment,
  error
}: InstallProgressProps) {
  const steps = getProgressSteps(deployment, hasDeps);
  const percent = getProgressPercent(steps);
  const isFailed = deployment?.status === "FAILED" || !!error;

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">
          {isFailed
            ? `Failed to set up ${appName}`
            : `Setting up ${appName}...`}
        </p>
        {!isFailed && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {percent}%
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${
            isFailed ? "bg-destructive" : "bg-primary"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* Error message */}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Steps */}
      <div className="space-y-2.5">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <StepIcon status={step.status} />
            <span
              className={`text-sm ${
                step.status === "done"
                  ? "text-muted-foreground"
                  : step.status === "active"
                    ? "text-foreground font-medium"
                    : "text-muted-foreground/50"
              }`}
            >
              {step.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

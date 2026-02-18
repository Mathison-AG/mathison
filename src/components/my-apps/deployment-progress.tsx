"use client";

import { Check, Loader2, Circle, AlertCircle } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import type { DeploymentStatus } from "@/generated/prisma/enums";

// ─── Step types ───────────────────────────────────────────

type StepStatus = "done" | "active" | "pending" | "error";

interface ProgressStep {
  label: string;
  status: StepStatus;
}

// ─── Step derivation ──────────────────────────────────────

function getInstallSteps(
  status: DeploymentStatus,
  appName: string,
  hasDeps: boolean,
  errorMessage: string | null
): ProgressStep[] {
  const steps: ProgressStep[] = [
    { label: "Preparing workspace", status: "pending" },
  ];

  if (hasDeps) {
    steps.push({ label: "Setting up required services", status: "pending" });
  }

  steps.push(
    { label: `Installing ${appName}`, status: "pending" },
    { label: "Starting up", status: "pending" },
  );

  const setStatus = (idx: number, s: StepStatus) => {
    const step = steps[idx];
    if (step) step.status = s;
  };

  if (status === "PENDING") {
    setStatus(0, "active");
  } else if (status === "DEPLOYING") {
    setStatus(0, "done");
    if (hasDeps) {
      setStatus(1, "done");
      setStatus(2, "active");
    } else {
      setStatus(1, "active");
    }
  } else if (status === "RUNNING") {
    for (const s of steps) s.status = "done";
  } else if (status === "FAILED") {
    // Mark steps leading up to failure as done, and the failing step as error
    setStatus(0, "done");
    if (hasDeps) {
      setStatus(1, "done");
      setStatus(2, "error");
    } else {
      setStatus(1, "error");
    }
  }

  return steps;
}

function getRemoveSteps(status: DeploymentStatus): ProgressStep[] {
  if (status === "STOPPED") {
    return [
      { label: "Stopping services", status: "done" },
      { label: "Cleaning up resources", status: "done" },
    ];
  }

  return [
    { label: "Stopping services", status: "active" },
    { label: "Cleaning up resources", status: "pending" },
  ];
}

function getProgressPercent(steps: ProgressStep[]): number {
  const total = steps.length;
  const done = steps.filter((s) => s.status === "done").length;
  const hasActive = steps.some((s) => s.status === "active");
  return Math.round(((done + (hasActive ? 0.5 : 0)) / total) * 100);
}

// ─── Step icon ────────────────────────────────────────────

function StepIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case "done":
      return (
        <div className="flex size-5 items-center justify-center rounded-full bg-green-500/15">
          <Check className="size-3 text-green-500" strokeWidth={3} />
        </div>
      );
    case "active":
      return (
        <div className="flex size-5 items-center justify-center">
          <Loader2 className="size-4 text-primary animate-spin" />
        </div>
      );
    case "error":
      return (
        <div className="flex size-5 items-center justify-center rounded-full bg-destructive/15">
          <AlertCircle className="size-3 text-destructive" />
        </div>
      );
    case "pending":
      return (
        <div className="flex size-5 items-center justify-center">
          <Circle className="size-3 text-muted-foreground/30" />
        </div>
      );
  }
}

// ─── Component ────────────────────────────────────────────

interface DeploymentProgressProps {
  status: DeploymentStatus;
  appName: string;
  hasDeps: boolean;
  errorMessage: string | null;
}

export function DeploymentProgress({
  status,
  appName,
  hasDeps,
  errorMessage,
}: DeploymentProgressProps) {
  const isDeleting = status === "DELETING";
  const isFailed = status === "FAILED";

  const steps = isDeleting
    ? getRemoveSteps(status)
    : getInstallSteps(status, appName, hasDeps, errorMessage);

  const percent = isFailed ? getProgressPercent(steps) : getProgressPercent(steps);

  const heading = isFailed
    ? `Failed to set up ${appName}`
    : isDeleting
      ? `Removing ${appName}...`
      : `Setting up ${appName}...`;

  return (
    <Card className="p-5 space-y-5">
      {/* Header + percentage */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{heading}</p>
        {!isFailed && (
          <span className="text-xs font-medium text-muted-foreground tabular-nums">
            {percent}%
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-700 ease-out",
            isFailed ? "bg-destructive" : "bg-primary"
          )}
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-3">
            <StepIcon status={step.status} />
            <span
              className={cn("text-sm", {
                "text-muted-foreground": step.status === "done",
                "text-foreground font-medium": step.status === "active",
                "text-destructive font-medium": step.status === "error",
                "text-muted-foreground/40": step.status === "pending",
              })}
            >
              {step.label}
            </span>
          </div>
        ))}
      </div>

      {/* Error detail */}
      {isFailed && errorMessage && (
        <div className="rounded-lg bg-destructive/5 border border-destructive/20 px-4 py-3">
          <p className="text-sm text-destructive leading-relaxed">
            {errorMessage}
          </p>
        </div>
      )}
    </Card>
  );
}

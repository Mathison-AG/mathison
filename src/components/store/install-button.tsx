"use client";

import { Loader2, Check, AlertCircle, Download } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { InstallPhase } from "@/hooks/use-install";

interface InstallButtonProps {
  phase: InstallPhase;
  onInstall: () => void;
  onRetry: () => void;
  size?: "default" | "sm" | "lg";
  className?: string;
}

export function InstallButton({
  phase,
  onInstall,
  onRetry,
  size = "default",
  className,
}: InstallButtonProps) {
  switch (phase) {
    case "idle":
      return (
        <Button
          onClick={onInstall}
          size={size}
          className={className}
        >
          <Download className="size-4" />
          Install
        </Button>
      );

    case "installing":
    case "polling":
      return (
        <Button
          disabled
          size={size}
          className={className}
        >
          <Loader2 className="size-4 animate-spin" />
          Installing...
        </Button>
      );

    case "success":
      return (
        <Button
          variant="outline"
          size={size}
          className={`border-green-500/30 text-green-600 dark:text-green-400 hover:bg-green-500/5 ${className ?? ""}`}
          disabled
        >
          <Check className="size-4" />
          Installed
        </Button>
      );

    case "error":
      return (
        <Button
          onClick={onRetry}
          variant="destructive"
          size={size}
          className={className}
        >
          <AlertCircle className="size-4" />
          Retry
        </Button>
      );
  }
}

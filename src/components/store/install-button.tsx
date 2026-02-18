"use client";

import { Loader2, AlertCircle, Download } from "lucide-react";

import { Button } from "@/components/ui/button";

interface InstallButtonProps {
  isPending: boolean;
  error: string | null;
  onInstall: () => void;
  size?: "default" | "sm" | "lg";
  className?: string;
}

export function InstallButton({
  isPending,
  error,
  onInstall,
  size = "default",
  className,
}: InstallButtonProps) {
  if (isPending) {
    return (
      <Button disabled size={size} className={className}>
        <Loader2 className="size-4 animate-spin" />
        Installing...
      </Button>
    );
  }

  if (error) {
    return (
      <Button
        onClick={onInstall}
        variant="destructive"
        size={size}
        className={className}
      >
        <AlertCircle className="size-4" />
        Retry
      </Button>
    );
  }

  return (
    <Button onClick={onInstall} size={size} className={className}>
      <Download className="size-4" />
      Install
    </Button>
  );
}

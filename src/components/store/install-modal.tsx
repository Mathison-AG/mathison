"use client";

import Image from "next/image";
import { Download, AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { InstallProgress } from "./install-progress";
import { InstallSuccess } from "./install-success";
import { FirstInstallCelebration } from "@/components/onboarding/first-install-celebration";
import { useFirstInstall } from "@/hooks/use-first-install";

import type { Recipe } from "@/types/recipe";
import type { Deployment } from "@/types/deployment";
import type { InstallPhase } from "@/hooks/use-install";

interface InstallModalProps {
  recipe: Recipe | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phase: InstallPhase;
  deployment: Deployment | null;
  error: string | null;
  onConfirm: () => void;
  onReset: () => void;
}

export function InstallModal({
  recipe,
  open,
  onOpenChange,
  phase,
  deployment,
  error,
  onConfirm,
  onReset
}: InstallModalProps) {
  const { isFirstInstall, markInstalled } = useFirstInstall();

  if (!recipe) return null;

  const iconSrc = recipe.iconUrl || `/icons/${recipe.slug}.svg`;
  const isInstalling = phase === "installing" || phase === "polling";
  const hasDeps = recipe.dependencies.length > 0;

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) {
      // If install is complete (success/error), reset on close
      if (phase === "success" || phase === "error" || phase === "idle") {
        if (phase === "success" && isFirstInstall) {
          markInstalled();
        }
        onReset();
      }
      onOpenChange(false);
    }
  }

  // First install celebration view
  if (phase === "success" && isFirstInstall) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
          <DialogTitle className="sr-only">
            {recipe.displayName} installed — your first app!
          </DialogTitle>
          <FirstInstallCelebration
            appName={recipe.displayName}
            appUrl={deployment?.url ?? null}
            gettingStarted={recipe.gettingStarted}
          />
        </DialogContent>
      </Dialog>
    );
  }

  // Success view
  if (phase === "success") {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
          <DialogTitle className="sr-only">
            {recipe.displayName} installed
          </DialogTitle>
          <InstallSuccess
            appName={recipe.displayName}
            appUrl={deployment?.url ?? null}
            gettingStarted={recipe.gettingStarted}
          />
        </DialogContent>
      </Dialog>
    );
  }

  // Progress view
  if (isInstalling) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent
          className="sm:max-w-md"
          showCloseButton={false}
          aria-describedby={undefined}
        >
          <DialogTitle className="sr-only">
            Installing {recipe.displayName}
          </DialogTitle>
          <InstallProgress
            appName={recipe.displayName}
            hasDeps={hasDeps}
            deployment={deployment}
          />
        </DialogContent>
      </Dialog>
    );
  }

  // Confirmation view (idle or error)
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-md"
        aria-describedby="install-dialog-desc"
      >
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border bg-background shadow-sm">
              <Image
                src={iconSrc}
                alt={recipe.displayName}
                width={28}
                height={28}
                className="size-7"
              />
            </div>
            <div>
              <DialogTitle>Install {recipe.displayName}?</DialogTitle>
              <DialogDescription id="install-dialog-desc">
                {hasDeps
                  ? `This will set up ${recipe.displayName} and everything it needs to run. It usually takes about a minute.`
                  : `This will set up ${recipe.displayName} in your workspace. It usually takes about a minute.`}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 flex items-start gap-2.5">
            <AlertCircle className="size-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm text-destructive leading-relaxed">{error}</p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button onClick={onConfirm}>
            <Download className="size-4" />
            {phase === "error" ? "Try Again" : "Install"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

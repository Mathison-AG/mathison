"use client";

import Image from "next/image";
import { Download, AlertCircle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";

import type { Recipe } from "@/types/recipe";

interface InstallModalProps {
  recipe: Recipe | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPending: boolean;
  error: string | null;
  onConfirm: () => void;
}

export function InstallModal({
  recipe,
  open,
  onOpenChange,
  isPending,
  error,
  onConfirm
}: InstallModalProps) {
  if (!recipe) return null;

  const iconSrc = recipe.iconUrl || `/icons/${recipe.slug}.svg`;
  const hasDeps = recipe.dependencies.length > 0;

  return (
    <Dialog open={open} onOpenChange={isPending ? undefined : onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        showCloseButton={!isPending}
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
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Installing...
              </>
            ) : (
              <>
                <Download className="size-4" />
                {error ? "Try Again" : "Install"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

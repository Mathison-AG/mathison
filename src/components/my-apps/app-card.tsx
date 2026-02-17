"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ExternalLink,
  MoreHorizontal,
  Settings,
  RotateCw,
  Trash2,
  Database
} from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { StatusIndicator } from "./status-indicator";
import { RemoveDialog } from "./remove-dialog";
import { OpenButton } from "./open-button";
import { useRemoveApp, useRestartApp } from "@/hooks/use-my-apps";

import type { Deployment } from "@/types/deployment";

// ─── Component ───────────────────────────────────────────

interface MyAppCardProps {
  app: Deployment;
}

export function MyAppCard({ app }: MyAppCardProps) {
  const router = useRouter();
  const [removeOpen, setRemoveOpen] = useState(false);
  const removeApp = useRemoveApp();
  const restartApp = useRestartApp();

  const iconSrc = app.recipe.iconUrl || `/icons/${app.recipe.slug}.svg`;
  const isRunning = app.status === "RUNNING";
  const isTransitional = ["PENDING", "DEPLOYING", "DELETING"].includes(
    app.status
  );

  function handleRemove() {
    removeApp.mutate(app.id, {
      onSuccess: () => {
        setRemoveOpen(false);
        toast.success(`${app.recipe.displayName} removed.`);
      },
      onError: (err) => {
        toast.error(err.message);
      }
    });
  }

  function handleRestart() {
    restartApp.mutate({
      deploymentId: app.id,
      config: app.config as Record<string, unknown>
    });
  }

  return (
    <>
      <Link
        href={`/apps/${app.id}`}
        className="block group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl"
        aria-label={`${app.recipe.displayName} — ${app.status === "RUNNING" ? "Running" : app.status === "FAILED" ? "Needs attention" : app.status}`}
      >
        <Card className="relative flex flex-col items-center gap-2.5 p-4 sm:gap-3 sm:p-6 card-hover hover:border-primary/20">
          {/* App Icon */}
          <div className="flex items-center justify-center size-16 rounded-2xl border bg-background shadow-sm">
            <Image
              src={iconSrc}
              alt={app.recipe.displayName}
              width={36}
              height={36}
              className="size-9"
            />
          </div>

          {/* Name & Category */}
          <div className="text-center space-y-0.5 min-w-0 w-full">
            <h3 className="font-semibold leading-tight truncate">
              {app.recipe.displayName}
            </h3>
            <p className="text-xs text-muted-foreground capitalize">
              {app.recipe.category}
            </p>
          </div>

          {/* Status */}
          <StatusIndicator status={app.status} />

          {/* Actions */}
          <div className="flex items-center gap-2 w-full mt-auto pt-1">
            {isRunning ? (
              <OpenButton
                deploymentId={app.id}
                appName={app.recipe.displayName}
                url={app.url}
                status={app.status}
                hasWebUI={app.recipe.hasWebUI}
                className="flex-1"
              />
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  router.push(`/apps/${app.id}`);
                }}
              >
                Details
              </Button>
            )}

            {/* More actions menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8 shrink-0"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                >
                  <MoreHorizontal className="size-4" />
                  <span className="sr-only">More actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                onClick={(e) => e.stopPropagation()}
              >
                {app.recipe.hasWebUI && app.url && isRunning && (
                  <DropdownMenuItem asChild>
                    <a href={app.url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-2 size-4" />
                      Open
                    </a>
                  </DropdownMenuItem>
                )}
                {!app.recipe.hasWebUI && isRunning && (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.preventDefault();
                    }}
                  >
                    <Database className="mr-2 size-4" />
                    Connection Info
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={(e) => {
                    e.preventDefault();
                    router.push(`/apps/${app.id}`);
                  }}
                >
                  <Settings className="mr-2 size-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.preventDefault();
                    handleRestart();
                  }}
                  disabled={isTransitional || restartApp.isPending}
                >
                  <RotateCw className="mr-2 size-4" />
                  Restart
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => {
                    e.preventDefault();
                    setRemoveOpen(true);
                  }}
                  className="text-destructive focus:text-destructive"
                  disabled={isTransitional}
                >
                  <Trash2 className="mr-2 size-4" />
                  Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </Card>
      </Link>

      {/* Remove confirmation dialog */}
      <RemoveDialog
        appName={app.recipe.displayName}
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        onConfirm={handleRemove}
        isRemoving={removeApp.isPending}
      />
    </>
  );
}

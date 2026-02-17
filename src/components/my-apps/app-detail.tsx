"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ExternalLink,
  RotateCw,
  Trash2,
  Calendar,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusIndicator } from "./status-indicator";
import { RemoveDialog } from "./remove-dialog";
import { useMyApp, useRemoveApp, useRestartApp } from "@/hooks/use-my-apps";

// ─── Time formatting ─────────────────────────────────────

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
  if (diffDays < 30) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ─── Loading skeleton ────────────────────────────────────

function DetailSkeleton() {
  return (
    <div className="space-y-8">
      <div className="flex items-start gap-4">
        <Skeleton className="size-16 rounded-2xl shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
        <Skeleton className="h-9 w-24 rounded-md" />
      </div>
      <Separator />
      <div className="space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-48" />
      </div>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────

interface AppDetailProps {
  id: string;
  gettingStarted?: string | null;
}

export function AppDetail({ id, gettingStarted }: AppDetailProps) {
  const router = useRouter();
  const { data: app, isLoading } = useMyApp(id);
  const removeApp = useRemoveApp();
  const restartApp = useRestartApp();
  const [removeOpen, setRemoveOpen] = useState(false);

  if (isLoading) return <DetailSkeleton />;
  if (!app) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-sm font-medium">App not found</p>
          <Button variant="outline" size="sm" asChild>
            <Link href="/apps">Back to My Apps</Link>
          </Button>
        </div>
      </div>
    );
  }

  const iconSrc = app.recipe.iconUrl || `/icons/${app.recipe.slug}.svg`;
  const hasUrl = !!app.url;
  const isRunning = app.status === "RUNNING";
  const isTransitional = ["PENDING", "DEPLOYING", "DELETING"].includes(app.status);

  function handleRemove() {
    removeApp.mutate(app!.id, {
      onSuccess: () => {
        toast.success(`${app!.recipe.displayName} removed.`);
        router.push("/apps");
      },
      onError: (err) => {
        toast.error(err.message);
      },
    });
  }

  function handleRestart() {
    restartApp.mutate({
      deploymentId: app!.id,
      config: app!.config as Record<string, unknown>,
    });
  }

  return (
    <div className="space-y-8">
      {/* Back link */}
      <Link
        href="/apps"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-4" />
        My Apps
      </Link>

      {/* Header */}
      <div className="flex items-start gap-4 flex-wrap sm:flex-nowrap">
        <div className="flex items-center justify-center size-16 rounded-2xl border bg-background shadow-sm shrink-0">
          <Image
            src={iconSrc}
            alt={app.recipe.displayName}
            width={36}
            height={36}
            className="size-9"
          />
        </div>

        <div className="flex-1 min-w-0 space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">
            {app.recipe.displayName}
          </h1>
          <p className="text-sm text-muted-foreground capitalize">
            {app.recipe.category}
          </p>
          <StatusIndicator status={app.status} />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {hasUrl && isRunning && (
            <Button asChild>
              <a href={app.url!} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 size-4" />
                Open
              </a>
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            onClick={handleRestart}
            disabled={isTransitional || restartApp.isPending}
            title="Restart"
          >
            <RotateCw className="size-4" />
          </Button>
        </div>
      </div>

      <Separator />

      {/* Info section */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-3 text-sm">
          <Calendar className="size-4 text-muted-foreground shrink-0" />
          <div>
            <p className="text-muted-foreground">Installed</p>
            <p className="font-medium">{formatRelativeTime(app.createdAt)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Clock className="size-4 text-muted-foreground shrink-0" />
          <div>
            <p className="text-muted-foreground">Last updated</p>
            <p className="font-medium">{formatRelativeTime(app.updatedAt)}</p>
          </div>
        </div>
      </div>

      {/* Getting Started */}
      {gettingStarted && (
        <>
          <Separator />
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Getting Started</h2>
            <Card className="p-5">
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown>{gettingStarted}</ReactMarkdown>
              </div>
            </Card>
          </div>
        </>
      )}

      {/* Danger Zone */}
      <Separator />
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-destructive">Danger Zone</h2>
        <Card className="p-5 border-destructive/30">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="space-y-0.5">
              <p className="font-medium">Remove this app</p>
              <p className="text-sm text-muted-foreground">
                This will delete the app and all its data. This cannot be undone.
              </p>
            </div>
            <Button
              variant="destructive"
              onClick={() => setRemoveOpen(true)}
              disabled={isTransitional}
            >
              <Trash2 className="mr-2 size-4" />
              Remove App
            </Button>
          </div>
        </Card>
      </div>

      {/* Remove confirmation dialog */}
      <RemoveDialog
        appName={app.recipe.displayName}
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        onConfirm={handleRemove}
        isRemoving={removeApp.isPending}
      />
    </div>
  );
}

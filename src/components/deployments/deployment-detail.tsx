"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Trash2, Calendar, Box } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";

import { StatusBadge } from "./status-badge";
import { LogViewer } from "./log-viewer";

import type { DeploymentDetail as DeploymentDetailType } from "@/types/deployment";

// ─── Helpers ──────────────────────────────────────────────

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

// ─── Component ────────────────────────────────────────────

interface DeploymentDetailProps {
  deployment: DeploymentDetailType;
}

export function DeploymentDetail({ deployment }: DeploymentDetailProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isDeleting, setIsDeleting] = useState(false);

  const iconSrc =
    deployment.recipe.iconUrl || `/icons/${deployment.recipe.slug}.svg`;

  const config = deployment.config as Record<string, unknown>;
  const configEntries = Object.entries(config).filter(
    ([, v]) => v !== undefined && v !== null
  );

  async function handleRemove() {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/deployments/${deployment.id}`, {
        method: "DELETE"
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to remove service");
        setIsDeleting(false);
        return;
      }

      // Invalidate and redirect
      await queryClient.invalidateQueries({ queryKey: ["deployments"] });
      await queryClient.invalidateQueries({ queryKey: ["stack"] });
      router.push("/deployments");
    } catch {
      alert("Failed to remove service");
      setIsDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/deployments"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-4" />
        Back to deployments
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="flex size-14 shrink-0 items-center justify-center rounded-xl border bg-background">
          <Image
            src={iconSrc}
            alt={deployment.recipe.displayName}
            width={36}
            height={36}
            className="size-9"
          />
        </div>

        <div className="flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{deployment.name}</h1>
            <StatusBadge status={deployment.status} />
          </div>
          <p className="text-muted-foreground">
            {deployment.recipe.displayName}
          </p>
          {deployment.url && (
            <a
              href={deployment.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              <ExternalLink className="size-3" />
              {deployment.url}
            </a>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 shrink-0">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                size="sm"
                disabled={isDeleting || deployment.status === "DELETING"}
              >
                <Trash2 className="size-4" />
                Remove
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove service?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently remove{" "}
                  <strong>{deployment.name}</strong> (
                  {deployment.recipe.displayName}). All data associated with
                  this service will be lost. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleRemove}
                  className="bg-destructive text-white hover:bg-destructive/90"
                >
                  {isDeleting ? "Removing..." : "Remove"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <Separator />

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="events" disabled>
            Events
          </TabsTrigger>
        </TabsList>

        {/* Overview tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Details card */}
            <Card className="p-5 space-y-4">
              <h2 className="font-semibold">Details</h2>
              <div className="space-y-3 text-sm">
                <DetailRow
                  label="Service"
                  value={deployment.recipe.displayName}
                />
                <DetailRow
                  label="Category"
                  value={deployment.recipe.category}
                  className="capitalize"
                />
                <DetailRow
                  label="Created"
                  value={formatDate(deployment.createdAt)}
                  icon={<Calendar className="size-3" />}
                />
                <DetailRow
                  label="Updated"
                  value={formatDate(deployment.updatedAt)}
                  icon={<Calendar className="size-3" />}
                />
                {deployment.errorMessage && (
                  <div>
                    <p className="text-xs text-muted-foreground">Error</p>
                    <p className="text-destructive text-xs mt-0.5">
                      {deployment.errorMessage}
                    </p>
                  </div>
                )}
              </div>
            </Card>

            {/* Config card */}
            {configEntries.length > 0 && (
              <Card className="p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Box className="size-4 text-muted-foreground" />
                  <h2 className="font-semibold">Configuration</h2>
                </div>
                <div className="space-y-2 text-sm">
                  {configEntries.map(([key, value]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-4"
                    >
                      <span className="text-muted-foreground font-mono text-xs">
                        {key}
                      </span>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded truncate max-w-[200px]">
                        {String(value)}
                      </code>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Logs tab */}
        <TabsContent value="logs">
          <LogViewer deploymentId={deployment.id} />
        </TabsContent>

        {/* Events tab (placeholder) */}
        <TabsContent value="events">
          <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-dashed">
            <p className="text-sm text-muted-foreground">
              Event history coming soon.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Detail Row ───────────────────────────────────────────

function DetailRow({
  label,
  value,
  icon,
  className
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={`flex items-center gap-1 ${className || ""}`}>
        {icon}
        {value}
      </span>
    </div>
  );
}

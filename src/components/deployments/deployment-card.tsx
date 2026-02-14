"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronRight, ExternalLink, Cpu, MemoryStick, Tag } from "lucide-react";

import { StatusBadge } from "./status-badge";

import type { Deployment } from "@/types/deployment";
import { extractResources } from "@/types/deployment";

// ─── Helpers ──────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 1000
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ─── Component ────────────────────────────────────────────

interface DeploymentCardProps {
  deployment: Deployment;
}

export function DeploymentCard({ deployment }: DeploymentCardProps) {
  const iconSrc =
    deployment.recipe.iconUrl || `/icons/${deployment.recipe.slug}.svg`;

  const config = deployment.config as Record<string, unknown>;
  const resources = extractResources(config);

  return (
    <Link href={`/deployments/${deployment.id}`} className="block">
      <div className="group flex items-center gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/50">
        {/* Icon */}
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-background">
          <Image
            src={iconSrc}
            alt={deployment.recipe.displayName}
            width={24}
            height={24}
            className="size-6"
          />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold truncate">{deployment.name}</h3>
            <span className="text-sm text-muted-foreground hidden sm:inline">
              {deployment.recipe.displayName}
            </span>
            {deployment.appVersion && (
              <span className="hidden sm:inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                <Tag className="size-2.5" />
                v{deployment.appVersion}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {deployment.url && (
              <span
                role="link"
                tabIndex={0}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors truncate max-w-[200px] cursor-pointer"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  window.open(deployment.url!, "_blank", "noopener,noreferrer");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    window.open(
                      deployment.url!,
                      "_blank",
                      "noopener,noreferrer"
                    );
                  }
                }}
              >
                <ExternalLink className="size-3 shrink-0" />
                <span className="truncate">{deployment.url}</span>
              </span>
            )}
            {/* Resource summary */}
            {resources.cpuRequest && (
              <span className="hidden md:inline-flex items-center gap-1 text-[10px] text-muted-foreground/70">
                <Cpu className="size-2.5" />
                {resources.cpuRequest}
              </span>
            )}
            {resources.memoryRequest && (
              <span className="hidden md:inline-flex items-center gap-1 text-[10px] text-muted-foreground/70">
                <MemoryStick className="size-2.5" />
                {resources.memoryRequest}
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              {timeAgo(deployment.createdAt)}
            </span>
          </div>
        </div>

        {/* Status + chevron */}
        <StatusBadge status={deployment.status} />
        <ChevronRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 shrink-0" />
      </div>
    </Link>
  );
}

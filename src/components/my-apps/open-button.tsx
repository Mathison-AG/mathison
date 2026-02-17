"use client";

import { useState } from "react";
import { ExternalLink, Database } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ConnectionInfo } from "./connection-info";

import type { DeploymentStatus } from "@/generated/prisma/enums";

// ─── Types ────────────────────────────────────────────────

interface OpenButtonProps {
  deploymentId: string;
  appName: string;
  url: string | null;
  status: DeploymentStatus;
  hasWebUI: boolean;
  size?: "sm" | "default";
  className?: string;
}

// ─── Component ────────────────────────────────────────────

/**
 * Smart button that shows the right action based on app type:
 * - Web UI apps (n8n, MinIO, etc.) → "Open" link in new tab
 * - Database/service apps (PostgreSQL, Redis) → "Connection Info" dialog
 */
export function OpenButton({
  deploymentId,
  appName,
  url,
  status,
  hasWebUI,
  size = "sm",
  className,
}: OpenButtonProps) {
  const [connectionOpen, setConnectionOpen] = useState(false);

  const isRunning = status === "RUNNING";
  const isTransitional = ["PENDING", "DEPLOYING", "DELETING"].includes(status);

  // Web UI apps with a URL → "Open" button
  if (hasWebUI && url && isRunning) {
    return (
      <Button
        variant="default"
        size={size}
        className={className}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          window.open(url, "_blank", "noopener,noreferrer");
        }}
      >
        <ExternalLink className="size-3.5 mr-1.5" />
        Open
      </Button>
    );
  }

  // Web UI apps without URL yet → disabled "Open" with tooltip
  if (hasWebUI && !url) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button
              variant="default"
              size={size}
              className={className}
              disabled
            >
              <ExternalLink className="size-3.5 mr-1.5" />
              Open
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {isTransitional
            ? "App is still starting up..."
            : "URL not available yet"}
        </TooltipContent>
      </Tooltip>
    );
  }

  // Database/service apps → "Connection Info" button
  if (!hasWebUI && isRunning) {
    return (
      <>
        <Button
          variant="default"
          size={size}
          className={className}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setConnectionOpen(true);
          }}
        >
          <Database className="size-3.5 mr-1.5" />
          Connection Info
        </Button>
        <ConnectionInfo
          deploymentId={deploymentId}
          appName={appName}
          open={connectionOpen}
          onOpenChange={setConnectionOpen}
        />
      </>
    );
  }

  // Not running → disabled button with appropriate label
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>
          <Button
            variant="outline"
            size={size}
            className={className}
            disabled
          >
            {hasWebUI ? (
              <>
                <ExternalLink className="size-3.5 mr-1.5" />
                Open
              </>
            ) : (
              <>
                <Database className="size-3.5 mr-1.5" />
                Connection Info
              </>
            )}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {isTransitional
          ? "App is still starting up..."
          : "App is not running"}
      </TooltipContent>
    </Tooltip>
  );
}

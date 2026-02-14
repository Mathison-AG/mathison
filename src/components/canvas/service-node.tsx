"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ExternalLink } from "lucide-react";

import { StatusBadge } from "@/components/deployments/status-badge";

export interface ServiceNodeData extends Record<string, unknown> {
  deploymentId: string;
  displayName: string;
  recipeName: string;
  recipeSlug: string;
  iconUrl: string;
  status: string;
  url: string | null;
  appVersion: string | null;
  category: string;
}

function ServiceNodeComponent({ data }: NodeProps) {
  const { displayName, recipeName, iconUrl, status, url, appVersion } =
    data as ServiceNodeData;

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm min-w-[220px] max-w-[280px] hover:shadow-md transition-shadow cursor-default">
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-muted-foreground !w-2 !h-2 !border-0"
      />

      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={iconUrl}
          alt=""
          className="size-9 rounded-lg bg-muted p-1 shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-sm truncate">{displayName}</span>
            {appVersion && (
              <span className="shrink-0 text-[10px] text-muted-foreground/70 font-mono">
                v{appVersion}
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {recipeName}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <StatusBadge status={status} />
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 hover:underline truncate max-w-[120px]"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="size-3 shrink-0" />
            <span className="truncate">{new URL(url).hostname}</span>
          </a>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-muted-foreground !w-2 !h-2 !border-0"
      />
    </div>
  );
}

export const ServiceNode = memo(ServiceNodeComponent);

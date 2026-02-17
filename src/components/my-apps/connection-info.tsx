"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, Check, Eye, EyeOff, Database } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Types ────────────────────────────────────────────────

interface AccessInfo {
  id: string;
  name: string;
  displayName: string;
  category: string;
  slug: string;
  hasWebUI: boolean;
  status: string;
  url: string | null;
  host: string;
  port: number | null;
  servicePort: number | null;
  config: Record<string, { label: string; value: string }>;
  secrets: Record<string, { label: string; value: string }>;
  connectionString: string | null;
}

interface ConnectionInfoProps {
  deploymentId: string;
  appName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Copy Button ──────────────────────────────────────────

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-7 shrink-0"
      onClick={handleCopy}
    >
      {copied ? (
        <Check className="size-3.5 text-green-500" />
      ) : (
        <Copy className="size-3.5" />
      )}
      <span className="sr-only">Copy</span>
    </Button>
  );
}

// ─── Secret Value ─────────────────────────────────────────

function SecretValue({ value }: { value: string }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="flex items-center gap-1.5">
      <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded flex-1 truncate">
        {visible ? value : "•".repeat(Math.min(value.length, 20))}
      </code>
      <Button
        variant="ghost"
        size="icon"
        className="size-7 shrink-0"
        onClick={() => setVisible(!visible)}
      >
        {visible ? (
          <EyeOff className="size-3.5" />
        ) : (
          <Eye className="size-3.5" />
        )}
        <span className="sr-only">{visible ? "Hide" : "Show"}</span>
      </Button>
      <CopyButton value={value} />
    </div>
  );
}

// ─── Component ────────────────────────────────────────────

export function ConnectionInfo({
  deploymentId,
  appName,
  open,
  onOpenChange,
}: ConnectionInfoProps) {
  const { data, isLoading } = useQuery<AccessInfo>({
    queryKey: ["deployment-access", deploymentId],
    queryFn: async () => {
      const res = await fetch(`/api/deployments/${deploymentId}/access`);
      if (!res.ok) throw new Error("Failed to fetch access info");
      return res.json();
    },
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="size-5" />
            {appName} Connection Details
          </DialogTitle>
          <DialogDescription>
            Use these details to connect to your {appName} instance.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 -mx-6 px-6">
          {isLoading ? (
            <div className="space-y-4 py-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : data ? (
            <div className="space-y-3 py-2">
              {/* Host & Port */}
              {data.port && (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Host
                    </label>
                    <div className="flex items-center gap-1.5">
                      <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded flex-1">
                        {data.host}
                      </code>
                      <CopyButton value={data.host} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Port
                    </label>
                    <div className="flex items-center gap-1.5">
                      <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded flex-1">
                        {data.port}
                      </code>
                      <CopyButton value={String(data.port)} />
                    </div>
                  </div>
                </>
              )}

              {/* Config values */}
              {Object.entries(data.config).map(([key, { label, value }]) => (
                <div key={key} className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {label}
                  </label>
                  <div className="flex items-center gap-1.5">
                    <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded flex-1 truncate">
                      {value}
                    </code>
                    <CopyButton value={value} />
                  </div>
                </div>
              ))}

              {/* Secret values */}
              {Object.entries(data.secrets).map(([key, { label, value }]) => (
                <div key={key} className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {label}
                  </label>
                  <SecretValue value={value} />
                </div>
              ))}

              {/* Connection String */}
              {data.connectionString && (
                <div className="space-y-1 pt-2 border-t">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Connection String
                  </label>
                  <SecretValue value={data.connectionString} />
                </div>
              )}

              {/* No port yet */}
              {!data.port && (
                <p className="text-sm text-muted-foreground">
                  Connection details will be available once the app is running.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4">
              Unable to load connection details.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Trigger Button ───────────────────────────────────────

interface ConnectionInfoButtonProps {
  deploymentId: string;
  appName: string;
  disabled?: boolean;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "icon";
  className?: string;
}

export function ConnectionInfoButton({
  deploymentId,
  appName,
  disabled,
  variant = "default",
  size = "sm",
  className,
}: ConnectionInfoButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        disabled={disabled}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Database className="size-3.5 mr-1.5" />
        Connection Info
      </Button>
      <ConnectionInfo
        deploymentId={deploymentId}
        appName={appName}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  HelpCircle,
  Loader2,
  Package,
  Plus,
  Search,
  Server,
  Settings,
  ShieldAlert,
  Stethoscope,
  Trash2,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────

interface ToolPartProps {
  type: string;
  toolName: string;
  state: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  approval?: { id: string };
  onToolApprovalResponse?: (params: {
    id: string;
    approved: boolean;
    reason?: string;
  }) => void | PromiseLike<void>;
}

// ─── Status badge helpers ────────────────────────────────

function statusVariant(
  status: string
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "running":
    case "RUNNING":
      return "default";
    case "installing":
    case "updating":
    case "setting up...":
      return "secondary";
    case "failed":
    case "FAILED":
    case "something went wrong":
      return "destructive";
    default:
      return "outline";
  }
}

// ─── Tool labels & icons ─────────────────────────────────

const TOOL_META: Record<
  string,
  { label: string; icon: React.ElementType; pendingLabel: string }
> = {
  findApps: {
    label: "Searching Apps",
    icon: Search,
    pendingLabel: "Searching apps...",
  },
  getAppInfo: {
    label: "App Info",
    icon: Package,
    pendingLabel: "Loading app details...",
  },
  installApp: {
    label: "Installing App",
    icon: Plus,
    pendingLabel: "Installing app...",
  },
  listMyApps: {
    label: "Your Apps",
    icon: Server,
    pendingLabel: "Checking your apps...",
  },
  getAppStatus: {
    label: "App Status",
    icon: Settings,
    pendingLabel: "Checking app status...",
  },
  diagnoseApp: {
    label: "Diagnosing",
    icon: Stethoscope,
    pendingLabel: "Looking into the issue...",
  },
  changeAppSettings: {
    label: "Updating App",
    icon: Settings,
    pendingLabel: "Updating settings...",
  },
  uninstallApp: {
    label: "Removing App",
    icon: Trash2,
    pendingLabel: "Removing app...",
  },
  requestApp: {
    label: "Requesting App",
    icon: Package,
    pendingLabel: "Submitting request...",
  },
  listWorkspaces: {
    label: "Your Projects",
    icon: Server,
    pendingLabel: "Loading projects...",
  },
  createWorkspace: {
    label: "Creating Project",
    icon: Plus,
    pendingLabel: "Creating project...",
  },
  deleteWorkspace: {
    label: "Deleting Project",
    icon: Trash2,
    pendingLabel: "Deleting project...",
  },
};

function getToolMeta(toolName: string) {
  return (
    TOOL_META[toolName] ?? {
      label: toolName,
      icon: Settings,
      pendingLabel: `Running ${toolName}...`,
    }
  );
}

// ─── Main component ──────────────────────────────────────

export function ToolInvocationCard({
  type,
  toolName,
  state,
  input,
  output,
  errorText,
  approval,
  onToolApprovalResponse,
}: ToolPartProps) {
  const name = toolName || type.replace(/^tool-/, "");
  const meta = getToolMeta(name);
  const Icon = meta.icon;

  // Approval-requested state — show confirmation UI
  if (state === "approval-requested" && approval && onToolApprovalResponse) {
    return (
      <ToolApprovalCard
        toolName={name}
        meta={meta}
        input={input}
        approvalId={approval.id}
        onApprovalResponse={onToolApprovalResponse}
      />
    );
  }

  // Pending state
  if (state === "input-streaming" || state === "input-available") {
    return (
      <div className="my-2 rounded-lg border bg-card p-3">
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
          <span className="font-medium">{meta.pendingLabel}</span>
        </div>
      </div>
    );
  }

  // Approval denied state
  if (state === "approval-denied") {
    return (
      <div className="my-2 rounded-lg border border-muted bg-muted/30 p-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <X className="size-4" />
          <span className="font-medium">{meta.label} — cancelled</span>
        </div>
      </div>
    );
  }

  // Error state
  if (state === "output-error") {
    return (
      <div className="my-2 rounded-lg border border-destructive/50 bg-destructive/5 p-3">
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertTriangle className="size-4" />
          <span className="font-medium">{meta.label} failed</span>
        </div>
        {errorText && (
          <p className="mt-1 text-xs text-destructive/80">{errorText}</p>
        )}
      </div>
    );
  }

  // Output available
  if (state === "output-available") {
    return (
      <div className="my-2 rounded-lg border bg-card p-3">
        <div className="mb-2 flex items-center gap-2 text-sm">
          <Icon className="size-4 text-muted-foreground" />
          <span className="font-medium">{meta.label}</span>
          <CheckCircle2 className="ml-auto size-3.5 text-green-500" />
        </div>
        <div className="text-sm">
          <ToolResultContent toolName={name} output={output} />
        </div>
      </div>
    );
  }

  return null;
}

// ─── Tool approval card ─────────────────────────────────

interface ToolApprovalCardProps {
  toolName: string;
  meta: { label: string; icon: React.ElementType; pendingLabel: string };
  input: unknown;
  approvalId: string;
  onApprovalResponse: (params: {
    id: string;
    approved: boolean;
    reason?: string;
  }) => void | PromiseLike<void>;
}

function ToolApprovalCard({
  toolName,
  input,
  approvalId,
  onApprovalResponse,
}: ToolApprovalCardProps) {
  const [responded, setResponded] = useState(false);

  function handleApprove() {
    setResponded(true);
    onApprovalResponse({ id: approvalId, approved: true });
  }

  function handleDeny() {
    setResponded(true);
    onApprovalResponse({
      id: approvalId,
      approved: false,
      reason: "User cancelled the action",
    });
  }

  const description = getApprovalDescription(toolName, input);

  if (responded) {
    return (
      <div className="my-2 rounded-lg border bg-card p-3">
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
          <span className="font-medium">Processing...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="my-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-destructive">
        <ShieldAlert className="size-4" />
        <span>Confirmation Required</span>
      </div>
      <p className="mt-2 text-sm text-foreground">{description}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        This action cannot be undone. All data associated with this app will
        be permanently deleted.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <Button
          size="sm"
          variant="destructive"
          className="h-8 text-xs"
          onClick={handleApprove}
        >
          <Trash2 className="mr-1.5 size-3" />
          Confirm
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          onClick={handleDeny}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

function getApprovalDescription(toolName: string, input: unknown): string {
  if (toolName === "uninstallApp") {
    const data = input as { appName?: string; appId?: string };
    const name = data.appName || "this app";
    return `Are you sure you want to remove ${name}?`;
  }
  if (toolName === "deleteWorkspace") {
    const data = input as { workspaceName?: string };
    const name = data.workspaceName || "this project";
    return `Are you sure you want to delete ${name} and all its apps?`;
  }
  return "Do you want to proceed with this action?";
}

// ─── Tool-specific result renderers ──────────────────────

interface ToolResultProps {
  toolName: string;
  output: unknown;
}

function ToolResultContent({ toolName, output }: ToolResultProps) {
  switch (toolName) {
    case "findApps":
      return <FindAppsResult output={output} />;
    case "getAppInfo":
      return <AppInfoResult output={output} />;
    case "installApp":
      return <InstallResult output={output} />;
    case "listMyApps":
      return <MyAppsResult output={output} />;
    case "getAppStatus":
      return <AppStatusResult output={output} />;
    case "diagnoseApp":
      return <DiagnoseResult output={output} />;
    case "changeAppSettings":
      return <UpdateResult output={output} />;
    case "uninstallApp":
      return <RemoveResult output={output} />;
    case "requestApp":
      return <RequestAppResult output={output} />;
    default:
      return <GenericResult output={output} />;
  }
}

// ─── Find apps ───────────────────────────────────────────

function FindAppsResult({ output }: { output: unknown }) {
  const items = output as Array<{
    slug: string;
    name: string;
    tagline: string;
    category: string;
    popular: boolean;
  }>;

  if (!Array.isArray(items) || items.length === 0) {
    return <p className="text-muted-foreground">No apps found.</p>;
  }

  return (
    <div className="space-y-1.5">
      {items.map((item) => (
        <div
          key={item.slug}
          className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5"
        >
          <Package className="size-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <span className="font-medium">{item.name}</span>
            <span className="ml-1.5 text-xs text-muted-foreground">
              {item.category}
            </span>
          </div>
          {item.popular && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              Popular
            </Badge>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── App info ────────────────────────────────────────────

function AppInfoResult({ output }: { output: unknown }) {
  const app = output as {
    name?: string;
    tagline?: string;
    description?: string;
    useCases?: string[];
    error?: string;
  };

  if (app.error) {
    return <p className="text-muted-foreground">{app.error}</p>;
  }

  return (
    <div className="space-y-1">
      <p className="font-medium">{app.name}</p>
      <p className="text-xs text-muted-foreground">
        {app.tagline || app.description}
      </p>
      {app.useCases && app.useCases.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {app.useCases.slice(0, 3).map((uc) => (
            <Badge
              key={uc}
              variant="secondary"
              className="text-[10px] px-1.5 py-0"
            >
              {uc}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Install ─────────────────────────────────────────────

function InstallResult({ output }: { output: unknown }) {
  const data = output as {
    appName?: string;
    status?: string;
    message?: string;
    error?: string;
  };

  if (data.error) {
    return (
      <div className="flex items-center gap-2 text-destructive">
        <AlertTriangle className="size-3.5" />
        <span>{data.error}</span>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="font-medium">{data.appName}</span>
        {data.status && (
          <Badge variant={statusVariant(data.status)} className="text-[10px]">
            {data.status === "installing" ? "Setting up" : data.status}
          </Badge>
        )}
      </div>
      {data.message && (
        <p className="text-xs text-muted-foreground">{data.message}</p>
      )}
    </div>
  );
}

// ─── My apps ─────────────────────────────────────────────

function MyAppsResult({ output }: { output: unknown }) {
  const data = output as {
    apps?: Array<{
      appId: string;
      appName: string;
      displayName: string;
      statusLabel: string;
      healthy: boolean;
    }>;
    message?: string;
  };

  if (data.message && (!data.apps || data.apps.length === 0)) {
    return <p className="text-muted-foreground">{data.message}</p>;
  }

  const apps = data.apps ?? [];

  return (
    <div className="space-y-1.5">
      {apps.map((app) => (
        <div
          key={app.appId}
          className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5"
        >
          <span
            className={cn(
              "size-2 rounded-full shrink-0",
              app.healthy ? "bg-green-500" : "bg-yellow-500"
            )}
          />
          <div className="min-w-0 flex-1">
            <span className="font-medium">{app.appName}</span>
            <span className="ml-1.5 text-xs text-muted-foreground">
              {app.displayName}
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground">
            {app.statusLabel}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── App status ──────────────────────────────────────────

function AppStatusResult({ output }: { output: unknown }) {
  const data = output as {
    appName?: string;
    displayName?: string;
    statusLabel?: string;
    url?: string | null;
    healthy?: boolean;
    installedAt?: string;
    error?: string;
  };

  if (data.error) {
    return <p className="text-muted-foreground">{data.error}</p>;
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "size-2 rounded-full",
            data.healthy ? "bg-green-500" : "bg-yellow-500"
          )}
        />
        <span className="font-medium">{data.appName}</span>
        <span className="text-xs text-muted-foreground">
          {data.statusLabel}
        </span>
      </div>
      {data.url && (
        <div className="flex items-center gap-1 text-xs text-blue-500">
          <ExternalLink className="size-3" />
          <span className="truncate">{data.url}</span>
        </div>
      )}
      {data.installedAt && (
        <p className="text-xs text-muted-foreground">
          Installed {data.installedAt}
        </p>
      )}
    </div>
  );
}

// ─── Diagnose ────────────────────────────────────────────

function DiagnoseResult({ output }: { output: unknown }) {
  const data = output as {
    appName?: string;
    diagnosis?: string;
    suggestion?: string | null;
    error?: string;
  };

  if (data.error) {
    return <p className="text-muted-foreground">{data.error}</p>;
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Stethoscope className="size-3.5 text-muted-foreground" />
        <span className="font-medium">{data.appName}</span>
      </div>
      <p className="text-xs text-muted-foreground">{data.diagnosis}</p>
      {data.suggestion && (
        <div className="flex items-center gap-1.5 text-xs text-blue-500">
          <HelpCircle className="size-3 shrink-0" />
          <span>{data.suggestion}</span>
        </div>
      )}
    </div>
  );
}

// ─── Update ──────────────────────────────────────────────

function UpdateResult({ output }: { output: unknown }) {
  const data = output as {
    appId?: string;
    status?: string;
    message?: string;
    error?: string;
  };

  if (data.error) {
    return (
      <div className="flex items-center gap-2 text-destructive">
        <AlertTriangle className="size-3.5" />
        <span>{data.error}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <CheckCircle2 className="size-3.5 text-green-500" />
      <span>{data.message ?? "Settings updated."}</span>
    </div>
  );
}

// ─── Remove ──────────────────────────────────────────────

function RemoveResult({ output }: { output: unknown }) {
  const data = output as {
    appId?: string;
    status?: string;
    message?: string;
    error?: string;
  };

  if (data.error) {
    return (
      <div className="flex items-center gap-2 text-destructive">
        <AlertTriangle className="size-3.5" />
        <span>{data.error}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Trash2 className="size-3.5 text-muted-foreground" />
      <span>{data.message ?? "App removed."}</span>
    </div>
  );
}

// ─── Request app ─────────────────────────────────────────

function RequestAppResult({ output }: { output: unknown }) {
  const data = output as {
    appName?: string;
    message?: string;
  };

  return (
    <div className="space-y-1">
      {data.appName && (
        <p className="font-medium">{data.appName}</p>
      )}
      {data.message && (
        <p className="text-xs text-muted-foreground">{data.message}</p>
      )}
    </div>
  );
}

// ─── Generic fallback ────────────────────────────────────

function GenericResult({ output }: { output: unknown }) {
  if (!output) return null;

  const text =
    typeof output === "string" ? output : JSON.stringify(output, null, 2);

  return (
    <pre className="max-h-32 overflow-auto rounded bg-muted/80 p-2 text-[11px] font-mono">
      {text}
    </pre>
  );
}

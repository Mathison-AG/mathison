"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  ExternalLink,
  FileText,
  Loader2,
  Package,
  Search,
  Server,
  Settings,
  ShieldAlert,
  Trash2,
  Upload,
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
    case "RUNNING":
    case "HEALTHY":
      return "default";
    case "PENDING":
    case "DEPLOYING":
      return "secondary";
    case "FAILED":
    case "ERROR":
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
  searchCatalog: {
    label: "Catalog Search",
    icon: Search,
    pendingLabel: "Searching catalog...",
  },
  getRecipe: {
    label: "Service Details",
    icon: Package,
    pendingLabel: "Loading service details...",
  },
  deployService: {
    label: "Deploy Service",
    icon: Upload,
    pendingLabel: "Deploying service...",
  },
  getStackStatus: {
    label: "Stack Status",
    icon: Server,
    pendingLabel: "Checking your services...",
  },
  getServiceDetail: {
    label: "Service Details",
    icon: Settings,
    pendingLabel: "Loading service details...",
  },
  getServiceLogs: {
    label: "Service Logs",
    icon: FileText,
    pendingLabel: "Fetching logs...",
  },
  updateService: {
    label: "Update Service",
    icon: Settings,
    pendingLabel: "Updating service...",
  },
  removeService: {
    label: "Remove Service",
    icon: Trash2,
    pendingLabel: "Removing service...",
  },
  createRecipe: {
    label: "Create Recipe",
    icon: Package,
    pendingLabel: "Creating recipe...",
  },
  searchHelmCharts: {
    label: "Package Search",
    icon: ExternalLink,
    pendingLabel: "Searching packages...",
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
  // Extract the tool name from the part type (e.g. "tool-searchCatalog" → "searchCatalog")
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
      reason: "User cancelled the removal",
    });
  }

  // Build a user-friendly description based on the tool
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
        This action cannot be undone. All data associated with this service will
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
          Confirm Delete
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
  if (toolName === "removeService") {
    const data = input as { serviceName?: string; deploymentId?: string };
    const name = data.serviceName || "this service";
    return `Are you sure you want to remove ${name}?`;
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
    case "searchCatalog":
      return <SearchCatalogResult output={output} />;
    case "getRecipe":
      return <GetRecipeResult output={output} />;
    case "deployService":
      return <DeployResult output={output} />;
    case "getStackStatus":
      return <StackStatusResult output={output} />;
    case "getServiceDetail":
      return <ServiceDetailResult output={output} />;
    case "getServiceLogs":
      return <LogsResult output={output} />;
    case "updateService":
      return <UpdateResult output={output} />;
    case "removeService":
      return <RemoveResult output={output} />;
    case "createRecipe":
      return <CreateRecipeResult output={output} />;
    case "searchHelmCharts":
      return <HelmSearchResult output={output} />;
    default:
      return <GenericResult output={output} />;
  }
}

// ─── Catalog search ──────────────────────────────────────

function SearchCatalogResult({ output }: { output: unknown }) {
  const items = output as Array<{
    slug: string;
    displayName: string;
    description: string;
    category: string;
    tier: string;
  }>;

  if (!Array.isArray(items) || items.length === 0) {
    return <p className="text-muted-foreground">No services found.</p>;
  }

  return (
    <div className="space-y-1.5">
      {items.map((item) => (
        <div
          key={item.slug}
          className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5"
        >
          <Database className="size-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <span className="font-medium">{item.displayName}</span>
            <span className="ml-1.5 text-xs text-muted-foreground">
              {item.category}
            </span>
          </div>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {item.tier}
          </Badge>
        </div>
      ))}
    </div>
  );
}

// ─── Recipe detail ───────────────────────────────────────

function GetRecipeResult({ output }: { output: unknown }) {
  const recipe = output as {
    slug?: string;
    displayName?: string;
    description?: string;
    category?: string;
    tags?: string[];
    error?: string;
  };

  if (recipe.error) {
    return <p className="text-muted-foreground">{recipe.error}</p>;
  }

  return (
    <div className="space-y-1">
      <p className="font-medium">{recipe.displayName}</p>
      <p className="text-xs text-muted-foreground">{recipe.description}</p>
      {recipe.tags && recipe.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {recipe.tags.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="text-[10px] px-1.5 py-0"
            >
              {tag}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Deploy ──────────────────────────────────────────────

function DeployResult({ output }: { output: unknown }) {
  const data = output as {
    deploymentId?: string;
    name?: string;
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
        <span className="font-medium">{data.name}</span>
        {data.status && (
          <Badge variant={statusVariant(data.status)} className="text-[10px]">
            {data.status}
          </Badge>
        )}
      </div>
      {data.message && (
        <p className="text-xs text-muted-foreground">{data.message}</p>
      )}
    </div>
  );
}

// ─── Stack status ────────────────────────────────────────

function StackStatusResult({ output }: { output: unknown }) {
  const data = output as {
    services?: Array<{
      deploymentId: string;
      name: string;
      recipe: string;
      status: string;
      category: string;
    }>;
    message?: string;
  };

  if (data.message && (!data.services || data.services.length === 0)) {
    return <p className="text-muted-foreground">{data.message}</p>;
  }

  const services = data.services ?? [];

  return (
    <div className="space-y-1.5">
      {services.map((svc) => (
        <div
          key={svc.deploymentId}
          className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5"
        >
          <Server className="size-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <span className="font-medium">{svc.name}</span>
            <span className="ml-1.5 text-xs text-muted-foreground">
              {svc.recipe}
            </span>
          </div>
          <Badge
            variant={statusVariant(svc.status)}
            className="text-[10px] px-1.5 py-0"
          >
            {svc.status}
          </Badge>
        </div>
      ))}
    </div>
  );
}

// ─── Service detail ──────────────────────────────────────

function ServiceDetailResult({ output }: { output: unknown }) {
  const data = output as {
    name?: string;
    recipe?: string;
    status?: string;
    url?: string | null;
    pods?: Array<{ name: string; status: string; restarts: number }>;
    error?: string;
  };

  if (data.error) {
    return <p className="text-muted-foreground">{data.error}</p>;
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="font-medium">{data.name}</span>
        {data.status && (
          <Badge variant={statusVariant(data.status)} className="text-[10px]">
            {data.status}
          </Badge>
        )}
      </div>
      {data.recipe && (
        <p className="text-xs text-muted-foreground">Type: {data.recipe}</p>
      )}
      {data.url && (
        <p className="text-xs text-blue-500 truncate">{data.url}</p>
      )}
      {data.pods && data.pods.length > 0 && (
        <div className="mt-1 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            Instances
          </p>
          {data.pods.map((pod) => (
            <div
              key={pod.name}
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  pod.status === "Running" ? "bg-green-500" : "bg-yellow-500"
                )}
              />
              <span className="truncate">{pod.name}</span>
              {pod.restarts > 0 && (
                <span className="text-yellow-600">
                  {pod.restarts} restart{pod.restarts > 1 ? "s" : ""}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Logs ────────────────────────────────────────────────

function LogsResult({ output }: { output: unknown }) {
  const data = output as {
    name?: string;
    logs?: string;
    error?: string;
  };

  if (data.error) {
    return <p className="text-muted-foreground">{data.error}</p>;
  }

  return (
    <div className="space-y-1">
      {data.name && (
        <p className="text-xs font-medium text-muted-foreground">
          Logs: {data.name}
        </p>
      )}
      <pre className="max-h-40 overflow-auto rounded bg-muted/80 p-2 text-[11px] leading-relaxed font-mono">
        {data.logs ?? "No logs available."}
      </pre>
    </div>
  );
}

// ─── Update ──────────────────────────────────────────────

function UpdateResult({ output }: { output: unknown }) {
  const data = output as {
    deploymentId?: string;
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
      <span>{data.message ?? "Service updated."}</span>
    </div>
  );
}

// ─── Remove ──────────────────────────────────────────────

function RemoveResult({ output }: { output: unknown }) {
  const data = output as {
    deploymentId?: string;
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
      <span>{data.message ?? "Service removed."}</span>
    </div>
  );
}

// ─── Create recipe ───────────────────────────────────────

function CreateRecipeResult({ output }: { output: unknown }) {
  const data = output as {
    slug?: string;
    displayName?: string;
    status?: string;
    message?: string;
  };

  return (
    <div className="space-y-1">
      {data.displayName && (
        <p className="font-medium">{data.displayName}</p>
      )}
      {data.message && (
        <p className="text-xs text-muted-foreground">{data.message}</p>
      )}
    </div>
  );
}

// ─── Helm search ─────────────────────────────────────────

function HelmSearchResult({ output }: { output: unknown }) {
  const data = output as
    | Array<{
        name: string;
        repo: string;
        description: string;
        version: string;
        url: string;
      }>
    | { error: string };

  if (!Array.isArray(data)) {
    return (
      <p className="text-muted-foreground">
        {(data as { error: string }).error ?? "No results"}
      </p>
    );
  }

  if (data.length === 0) {
    return <p className="text-muted-foreground">No packages found.</p>;
  }

  return (
    <div className="space-y-1.5">
      {data.slice(0, 5).map((pkg) => (
        <div
          key={`${pkg.repo}-${pkg.name}`}
          className="rounded-md bg-muted/50 px-2.5 py-1.5"
        >
          <div className="flex items-center gap-2">
            <Package className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="font-medium text-xs">{pkg.name}</span>
            <span className="text-[10px] text-muted-foreground">
              v{pkg.version}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-1">
            {pkg.description}
          </p>
        </div>
      ))}
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

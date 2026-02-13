import {
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
  StopCircle,
  Trash2
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type DeploymentStatus =
  | "PENDING"
  | "DEPLOYING"
  | "RUNNING"
  | "FAILED"
  | "STOPPED"
  | "DELETING";

interface StatusConfig {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
  icon: React.ComponentType<{ className?: string }>;
  animate?: boolean;
  className?: string;
}

const statusConfig: Record<DeploymentStatus, StatusConfig> = {
  PENDING: {
    label: "Pending",
    variant: "outline",
    icon: Clock
  },
  DEPLOYING: {
    label: "Deploying",
    variant: "secondary",
    icon: Loader2,
    animate: true
  },
  RUNNING: {
    label: "Running",
    variant: "default",
    icon: CheckCircle2,
    className:
      "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25"
  },
  FAILED: {
    label: "Failed",
    variant: "destructive",
    icon: XCircle
  },
  STOPPED: {
    label: "Stopped",
    variant: "outline",
    icon: StopCircle
  },
  DELETING: {
    label: "Deleting",
    variant: "secondary",
    icon: Trash2,
    animate: true
  }
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status as DeploymentStatus] ?? {
    label: status,
    variant: "outline" as const,
    icon: Clock
  };

  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className={cn(config.className, className)}>
      <Icon className={cn("size-3", config.animate && "animate-spin")} />
      {config.label}
    </Badge>
  );
}

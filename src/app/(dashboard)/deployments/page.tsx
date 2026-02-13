"use client";

import { useState, useCallback } from "react";
import { Rocket } from "lucide-react";

import { useDeployments } from "@/hooks/use-deployments";
import { DeploymentCard } from "@/components/deployments/deployment-card";
import { DeploymentsFilters } from "@/components/deployments/deployments-filters";
import { Skeleton } from "@/components/ui/skeleton";

export default function DeploymentsPage() {
  const [status, setStatus] = useState("all");

  const { data: deployments, isLoading } = useDeployments(
    status !== "all" ? status : undefined
  );

  const handleStatusChange = useCallback((value: string) => {
    setStatus(value);
  }, []);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Rocket className="size-6 text-muted-foreground" />
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Deployments</h2>
          <p className="text-muted-foreground">
            Monitor and manage your running services.
          </p>
        </div>
      </div>

      {/* Status filters */}
      <DeploymentsFilters status={status} onStatusChange={handleStatusChange} />

      {/* Deployment list */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 rounded-lg border p-4"
            >
              <Skeleton className="size-10 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          ))}
        </div>
      ) : !deployments || deployments.length === 0 ? (
        <div className="flex min-h-[300px] items-center justify-center rounded-lg border border-dashed">
          <div className="text-center space-y-2">
            <Rocket className="size-8 text-muted-foreground mx-auto" />
            <p className="text-sm font-medium">No deployments yet</p>
            <p className="text-sm text-muted-foreground">
              Deploy a service from the catalog or use the chat assistant.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {deployments.map((deployment) => (
            <DeploymentCard key={deployment.id} deployment={deployment} />
          ))}
        </div>
      )}
    </div>
  );
}

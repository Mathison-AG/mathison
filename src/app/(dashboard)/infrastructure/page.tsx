import { Server } from "lucide-react";

import { ClusterOverview } from "@/components/infrastructure/cluster-overview";

export default function InfrastructurePage() {
  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Server className="size-6 text-muted-foreground" />
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Infrastructure</h2>
          <p className="text-sm text-muted-foreground">
            Monitor your cluster nodes, resource usage, and pod distribution.
          </p>
        </div>
      </div>

      <ClusterOverview />
    </div>
  );
}

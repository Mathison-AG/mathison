"use client";

import { use } from "react";
import { Loader2 } from "lucide-react";

import { useDeployment } from "@/hooks/use-deployments";
import { DeploymentDetail } from "@/components/deployments/deployment-detail";

interface DeploymentPageProps {
  params: Promise<{ id: string }>;
}

export default function DeploymentPage({ params }: DeploymentPageProps) {
  const { id } = use(params);
  const { data: deployment, isLoading, error } = useDeployment(id);

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center p-6">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !deployment) {
    return (
      <div className="flex min-h-[400px] items-center justify-center p-6">
        <div className="text-center">
          <p className="text-sm font-medium">Deployment not found</p>
          <p className="text-sm text-muted-foreground">
            The deployment you&apos;re looking for doesn&apos;t exist.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <DeploymentDetail deployment={deployment} />
    </div>
  );
}

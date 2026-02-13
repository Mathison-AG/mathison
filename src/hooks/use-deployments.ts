"use client";

import { useQuery } from "@tanstack/react-query";

import type { Deployment, DeploymentDetail } from "@/types/deployment";

export function useDeployments(status?: string) {
  return useQuery<Deployment[]>({
    queryKey: ["deployments", status],
    queryFn: async () => {
      const params = status && status !== "all" ? `?status=${status}` : "";
      const res = await fetch(`/api/deployments${params}`);
      if (!res.ok) throw new Error("Failed to fetch deployments");
      return res.json();
    },
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      const hasTransitional = data.some((d) =>
        ["PENDING", "DEPLOYING", "DELETING"].includes(d.status)
      );
      return hasTransitional ? 5000 : false;
    }
  });
}

export function useDeployment(id: string) {
  return useQuery<DeploymentDetail>({
    queryKey: ["deployments", id],
    queryFn: async () => {
      const res = await fetch(`/api/deployments/${id}`);
      if (!res.ok) throw new Error("Failed to fetch deployment");
      return res.json();
    },
    enabled: !!id,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      return ["PENDING", "DEPLOYING", "DELETING"].includes(data.status)
        ? 5000
        : false;
    }
  });
}

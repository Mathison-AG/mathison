"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { Deployment, DeploymentDetail } from "@/types/deployment";

// ─── List all user-installed apps ────────────────────────

export function useMyApps() {
  return useQuery<Deployment[]>({
    queryKey: ["my-apps"],
    queryFn: async () => {
      const res = await fetch("/api/deployments");
      if (!res.ok) throw new Error("Failed to fetch apps");
      const data: Deployment[] = await res.json();
      // Filter out auto-deployed dependencies (they have a parent that depends on them)
      const depIds = new Set(data.flatMap((d) => d.dependsOn));
      return data.filter((d) => !depIds.has(d.id));
    },
    refetchInterval: (query) => {
      const apps = query.state.data;
      if (!apps?.length) return false;
      const hasTransitional = apps.some((a) =>
        ["PENDING", "DEPLOYING", "DELETING"].includes(a.status)
      );
      return hasTransitional ? 5000 : false;
    },
  });
}

// ─── Single app detail ───────────────────────────────────

export function useMyApp(id: string) {
  return useQuery<DeploymentDetail>({
    queryKey: ["my-apps", id],
    queryFn: async () => {
      const res = await fetch(`/api/deployments/${id}`);
      if (!res.ok) throw new Error("Failed to fetch app");
      return res.json();
    },
    enabled: !!id,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      return ["PENDING", "DEPLOYING", "DELETING"].includes(data.status)
        ? 5000
        : false;
    },
  });
}

// ─── Remove app mutation ─────────────────────────────────

export function useRemoveApp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (deploymentId: string) => {
      const res = await fetch(`/api/deployments/${deploymentId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to remove app");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-apps"] });
      queryClient.invalidateQueries({ queryKey: ["deployments"] });
      queryClient.invalidateQueries({ queryKey: ["stack"] });
    },
  });
}

// ─── Restart app mutation ────────────────────────────────

export function useRestartApp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      deploymentId,
      config,
    }: {
      deploymentId: string;
      config: Record<string, unknown>;
    }) => {
      const res = await fetch(`/api/deployments/${deploymentId}/restart`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to restart app");
      }
      return res.json();
    },
    onSuccess: (_data, variables) => {
      toast.success("App is restarting...");
      queryClient.invalidateQueries({ queryKey: ["my-apps"] });
      queryClient.invalidateQueries({
        queryKey: ["my-apps", variables.deploymentId],
      });
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });
}

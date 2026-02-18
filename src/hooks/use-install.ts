"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

// ─── Types ────────────────────────────────────────────────

export interface InstallResult {
  deploymentId: string;
  name: string;
  status: string;
  displayName: string;
}

interface InstallError {
  error: string;
}

// ─── Error sanitization ──────────────────────────────────

function sanitizeError(raw: string | null): string {
  if (!raw) return "Installation failed. Please try again.";

  const lower = raw.toLowerCase();

  if (lower.includes("timeout") || lower.includes("timed out")) {
    return "The installation took too long. Please try again.";
  }
  if (lower.includes("network") || lower.includes("dial tcp") || lower.includes("connection refused")) {
    return "We couldn't reach the required servers. Please check your connection and try again.";
  }
  if (lower.includes("registry") || lower.includes("pull") || lower.includes("image")) {
    return "We had trouble downloading the app. This is usually temporary — please try again in a moment.";
  }
  if (lower.includes("quota") || lower.includes("forbidden") || lower.includes("exceeded")) {
    return "Your workspace doesn't have enough resources for this app. Try removing unused apps or contact support.";
  }
  if (lower.includes("insufficient") || lower.includes("not enough")) {
    return "Not enough resources available to run this app. Try freeing up resources by removing unused apps.";
  }
  if (lower.includes("already exists") || lower.includes("cannot re-use")) {
    return "This app is already set up in your workspace. Check your apps to see its status.";
  }
  if (lower.includes("namespace") && lower.includes("not found")) {
    return "Your workspace isn't ready yet. Please try again in a moment.";
  }
  if (raw.length > 120) {
    return "Something went wrong during installation. Please try again.";
  }

  return raw;
}

// ─── Hook ─────────────────────────────────────────────────

interface UseInstallReturn {
  install: (recipeSlug: string) => Promise<InstallResult>;
  isPending: boolean;
  error: string | null;
  reset: () => void;
}

export function useInstall(): UseInstallReturn {
  const queryClient = useQueryClient();

  const mutation = useMutation<InstallResult, Error, string>({
    mutationFn: async (recipeSlug: string) => {
      const res = await fetch("/api/apps/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipeSlug }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          sanitizeError((data as InstallError).error || null)
        );
      }

      return data as InstallResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-apps"] });
      queryClient.invalidateQueries({ queryKey: ["deployments"] });
      queryClient.invalidateQueries({ queryKey: ["catalog"] });
      queryClient.invalidateQueries({ queryKey: ["stack"] });
    },
  });

  return {
    install: mutation.mutateAsync,
    isPending: mutation.isPending,
    error: mutation.error?.message ?? null,
    reset: mutation.reset,
  };
}

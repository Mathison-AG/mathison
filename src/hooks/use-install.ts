"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { Deployment } from "@/types/deployment";

// ─── Types ────────────────────────────────────────────────

interface InstallResult {
  deploymentId: string;
  name: string;
  status: string;
  displayName: string;
}

interface InstallError {
  error: string;
}

// ─── Error sanitization ──────────────────────────────────

/**
 * Turn a raw technical error (from Helm/K8s/DB) into something
 * a non-technical user can understand.
 */
function sanitizeError(raw: string | null): string {
  if (!raw) return "Installation failed. Please try again.";

  const lower = raw.toLowerCase();

  // Network / registry errors
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return "The installation took too long. This usually means the app is still starting up — check back in a minute, or try again.";
  }
  if (lower.includes("network") || lower.includes("dial tcp") || lower.includes("connection refused")) {
    return "We couldn't reach the required servers. Please check your connection and try again.";
  }
  if (lower.includes("registry") || lower.includes("pull") || lower.includes("image")) {
    return "We had trouble downloading the app. This is usually temporary — please try again in a moment.";
  }

  // Resource / quota errors
  if (lower.includes("quota") || lower.includes("forbidden") || lower.includes("exceeded")) {
    return "Your workspace doesn't have enough resources for this app. Try removing unused apps or contact support.";
  }
  if (lower.includes("insufficient") || lower.includes("not enough")) {
    return "Not enough resources available to run this app. Try freeing up resources by removing unused apps.";
  }

  // Name / conflict errors
  if (lower.includes("already exists") || lower.includes("cannot re-use")) {
    return "This app is already set up in your workspace. Check your apps to see its status.";
  }

  // Namespace errors
  if (lower.includes("namespace") && lower.includes("not found")) {
    return "Your workspace isn't ready yet. Please try again in a moment.";
  }

  // Not healthy
  if (lower.includes("not yet healthy") || lower.includes("not ready")) {
    return "The app was installed but isn't responding yet. It may need a minute to start up — check back shortly.";
  }

  // Helm-specific
  if (lower.includes("helm") && lower.includes("failed")) {
    return "The installation ran into a problem. Please try again. If the issue persists, our team has been notified.";
  }

  // Process-level errors (exit code, signal, killed)
  if (lower.includes("exit") || lower.includes("signal") || lower.includes("killed")) {
    return "The installation process stopped unexpectedly. Please try again.";
  }

  // Generic fallback — but show a truncated version of the error for debugging
  if (raw.length > 120) {
    return "Something went wrong during installation. Please try again.";
  }

  // Short enough to show as-is (after stripping Helm prefixes)
  return raw;
}

export type InstallPhase =
  | "idle"
  | "installing"
  | "polling"
  | "success"
  | "error";

interface UseInstallReturn {
  phase: InstallPhase;
  deploymentId: string | null;
  deployment: Deployment | null;
  error: string | null;
  install: (recipeSlug: string) => void;
  reset: () => void;
}

// ─── Hook ─────────────────────────────────────────────────

export function useInstall(): UseInstallReturn {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<InstallPhase>("idle");
  const [deploymentId, setDeploymentId] = useState<string | null>(null);
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Poll for deployment status
  const startPolling = useCallback(
    (id: string) => {
      if (pollRef.current) clearInterval(pollRef.current);

      setPhase("polling");

      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/deployments/${id}`);
          if (!res.ok) return;

          const data: Deployment = await res.json();
          setDeployment(data);

          if (data.status === "RUNNING") {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setPhase("success");
            // Invalidate related queries
            queryClient.invalidateQueries({ queryKey: ["my-apps"] });
            queryClient.invalidateQueries({ queryKey: ["deployments"] });
            queryClient.invalidateQueries({ queryKey: ["catalog"] });
            queryClient.invalidateQueries({ queryKey: ["stack"] });
          } else if (data.status === "FAILED") {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setError(sanitizeError(data.errorMessage));
            setPhase("error");
            queryClient.invalidateQueries({ queryKey: ["my-apps"] });
            queryClient.invalidateQueries({ queryKey: ["deployments"] });
          }
        } catch {
          // Ignore poll errors — keep trying
        }
      }, 3000);
    },
    [queryClient]
  );

  // Install mutation
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
          (data as InstallError).error || "Something went wrong"
        );
      }

      return data as InstallResult;
    },
    onSuccess: (data) => {
      setDeploymentId(data.deploymentId);
      startPolling(data.deploymentId);
    },
    onError: (err) => {
      setError(err.message);
      setPhase("error");
    },
  });

  const install = useCallback(
    (recipeSlug: string) => {
      setPhase("installing");
      setError(null);
      setDeployment(null);
      setDeploymentId(null);
      mutation.mutate(recipeSlug);
    },
    [mutation]
  );

  const reset = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setPhase("idle");
    setDeploymentId(null);
    setDeployment(null);
    setError(null);
  }, []);

  return {
    phase,
    deploymentId,
    deployment,
    error,
    install,
    reset,
  };
}

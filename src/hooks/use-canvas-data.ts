"use client";

import { useQuery } from "@tanstack/react-query";

import type { Node, Edge } from "@xyflow/react";
import type { ServiceNodeData } from "@/components/canvas/service-node";

interface StackData {
  nodes: Node<ServiceNodeData>[];
  edges: Edge[];
}

export function useCanvasData() {
  return useQuery<StackData>({
    queryKey: ["stack"],
    queryFn: async () => {
      const res = await fetch("/api/stack");
      if (!res.ok) throw new Error("Failed to fetch stack");
      return res.json();
    },
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      const hasTransitional = data.nodes.some((n) =>
        ["PENDING", "DEPLOYING", "DELETING"].includes(n.data.status as string)
      );
      return hasTransitional ? 5000 : false;
    }
  });
}

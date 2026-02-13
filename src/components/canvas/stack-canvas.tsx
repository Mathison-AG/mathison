"use client";

import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  type ColorMode,
  type Node,
  type Edge
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useTheme } from "next-themes";
import { Loader2, Rocket, MessageCircle } from "lucide-react";

import { ServiceNode } from "./service-node";
import { DependencyEdge } from "./dependency-edge";
import { useCanvasData } from "@/hooks/use-canvas-data";
import { useAutoLayout } from "./use-auto-layout";

const nodeTypes = { service: ServiceNode };
const edgeTypes = { dependency: DependencyEdge };

export function StackCanvas() {
  const { data, isLoading, error } = useCanvasData();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const { resolvedTheme } = useTheme();

  useAutoLayout(data, setNodes, setEdges);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="size-8 animate-spin" />
          <p className="text-sm">Loading your stack...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center space-y-2 text-muted-foreground">
          <p className="text-sm">Failed to load stack data</p>
          <p className="text-xs">{error.message}</p>
        </div>
      </div>
    );
  }

  if (!data?.nodes.length) {
    return <CanvasEmptyState />;
  }

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        colorMode={(resolvedTheme as ColorMode) ?? "system"}
        proOptions={{ hideAttribution: true }}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        minZoom={0.3}
        maxZoom={2}
      >
        <Background gap={20} size={1} />
        <Controls
          showInteractive={false}
          className="!shadow-md !rounded-lg !border !border-border !bg-card"
        />
      </ReactFlow>
    </div>
  );
}

function CanvasEmptyState() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-sm text-center space-y-6">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-primary/10">
          <Rocket className="size-8 text-primary" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold tracking-tight">
            Your workspace is empty
          </h2>
          <p className="text-sm text-muted-foreground">
            Chat with Mathison to deploy your first service. Your services will
            appear here as an interactive visual map.
          </p>
        </div>
        <div className="flex items-center gap-2 justify-center text-sm text-muted-foreground">
          <MessageCircle className="size-4" />
          <span>Click the chat button to get started</span>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useCallback } from "react";
import dagre from "dagre";
import type { Node, Edge } from "@xyflow/react";

const NODE_WIDTH = 260;
const NODE_HEIGHT = 140;

function getLayoutedElements(nodes: Node[], edges: Edge[]) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "TB",
    nodesep: 80,
    ranksep: 100,
    marginx: 40,
    marginy: 40
  });

  nodes.forEach((node) => {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2
      }
    };
  });

  return { nodes: layoutedNodes, edges };
}

interface StackData {
  nodes: Node[];
  edges: Edge[];
}

export function useAutoLayout(
  data: StackData | undefined,
  setNodes: (nodes: Node[]) => void,
  setEdges: (edges: Edge[]) => void
) {
  const applyLayout = useCallback(
    (stackData: StackData) => {
      if (!stackData.nodes.length) {
        setNodes([]);
        setEdges([]);
        return;
      }

      const { nodes: layoutedNodes, edges: layoutedEdges } =
        getLayoutedElements(stackData.nodes, stackData.edges);

      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
    },
    [setNodes, setEdges]
  );

  useEffect(() => {
    if (data) {
      applyLayout(data);
    }
  }, [data, applyLayout]);

  return { applyLayout };
}

"use client";

import { memo } from "react";
import { BaseEdge, getSmoothStepPath, type EdgeProps } from "@xyflow/react";

function DependencyEdgeComponent({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  ...rest
}: EdgeProps) {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 16
  });

  return (
    <BaseEdge
      path={edgePath}
      style={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1.5 }}
      {...rest}
    />
  );
}

export const DependencyEdge = memo(DependencyEdgeComponent);

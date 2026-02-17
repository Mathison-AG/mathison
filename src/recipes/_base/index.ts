// Types
// Helpers
export { secret } from "./types";

export type {
  RecipeDefinition,
  BuildContext,
  ConnectionContext,
  ConnectionInfo,
  HealthCheckSpec,
  HealthCheckContext,
  KubernetesResource,
  SecretDefinition,
  DependencyDefinition,
  AiHints,
  ServicePortDefinition,
  IngressDefinition,
  IngressContext,
  StandardLabels,
  ResourceRequirements,
  EnvVar,
  EnvVarPlain,
  EnvVarSecretRef,
  VolumeMountDefinition,
  ProbeDefinition,
} from "./types";

// Builders
export * as builders from "./builders";

// Archetypes
export { database, cache, webApp, objectStore } from "./archetypes";

// Apply
export {
  applyResources,
  deleteResources,
  dryRunResources,
  readResource,
} from "./apply";
export type { ApplyOptions, ApplyResult, DeleteResult } from "./apply";

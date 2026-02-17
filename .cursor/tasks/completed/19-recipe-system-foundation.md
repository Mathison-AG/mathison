# Step 19 — Recipe System Foundation

## Goal

Build the typed recipe system that replaces Helm charts. Create the base types, K8s resource builders, archetype functions, Server-Side Apply wrapper, and convert all 5 existing recipes from Helm-based seed data to TypeScript modules. After this step, every recipe is a typed module with a Zod config schema and a `build()` function that produces K8s resource objects.

## Prerequisites

- Steps 01–18 completed (current Helm-based system working)
- `@kubernetes/client-node` already in the project
- Understanding of the 5 current recipes' Helm values templates

## What to Build

### 1. Base Types (`src/recipes/_base/types.ts`)

Core interfaces that all recipes implement:

```typescript
interface RecipeDefinition<TConfig> {
  // Identity
  slug: string;
  displayName: string;
  category: string;
  description: string;
  tags: string[];

  // Consumer-facing
  shortDescription?: string;
  useCases: string[];
  gettingStarted?: string;
  websiteUrl?: string;
  documentationUrl?: string;
  hasWebUI: boolean;

  // Configuration
  configSchema: ZodSchema<TConfig>;
  secrets: Record<string, SecretDefinition>;
  dependencies?: Record<string, DependencyDefinition>;

  // Build — produces typed K8s resource objects
  build(ctx: BuildContext<TConfig>): KubernetesResource[];

  // Connection info — for when other recipes depend on this one
  connectionInfo?(ctx: ConnectionContext<TConfig>): ConnectionInfo;

  // Health check definition
  healthCheck(ctx: HealthCheckContext<TConfig>): HealthCheckSpec;

  // AI metadata
  aiHints: AiHints;
}
```

`BuildContext<T>` provides the recipe with all it needs:
- `config: T` (Zod-validated, fully typed)
- `secrets: Record<string, string>` (generated passwords/keys)
- `deps: Record<string, ConnectionInfo>` (typed dependency connections)
- `name: string` (instance name)
- `namespace: string` (K8s namespace)
- `ingress?: IngressContext` (domain, TLS, ingress class)

### 2. K8s Resource Builders (`src/recipes/_base/builders.ts`)

Thin wrapper functions that construct typed `@kubernetes/client-node` objects with sensible defaults:

- `statefulSet(name, namespace, spec)` → `V1StatefulSet`
- `deployment(name, namespace, spec)` → `V1Deployment`
- `service(name, namespace, spec)` → `V1Service`
- `secret(name, namespace, data)` → `V1Secret`
- `persistentVolumeClaim(name, namespace, spec)` → `V1PersistentVolumeClaim`
- `ingress(name, namespace, spec)` → `V1Ingress`
- `configMap(name, namespace, data)` → `V1ConfigMap`

Each builder:
- Sets standard labels (`app.kubernetes.io/name`, `app.kubernetes.io/instance`, `app.kubernetes.io/managed-by: mathison`)
- Applies security context defaults (non-root where possible)
- Handles env vars from both plain values and secret references
- Returns a fully valid typed K8s object

### 3. Archetype Functions (`src/recipes/_base/archetypes/`)

Higher-level functions that generate complete recipes from simple descriptors:

- `webApp(descriptor)` → `RecipeDefinition` (Deployment + Service + optional PVC + optional Ingress)
- `database(descriptor)` → `RecipeDefinition` (StatefulSet + Service + Secret + PVC)
- `cache(descriptor)` → `RecipeDefinition` (StatefulSet + Service + Secret)
- `objectStore(descriptor)` → `RecipeDefinition` (StatefulSet + Service + Secret + PVC + dual Ingress)

Each archetype handles the K8s complexity so recipe authors just describe their app (image, port, env vars, storage, health check).

### 4. Server-Side Apply Wrapper (`src/recipes/_base/apply.ts`)

Functions for applying typed K8s resources:

- `applyResources(resources, options)` — Server-Side Apply a list of K8s objects
- `deleteResources(resources)` — Delete a list of K8s objects
- `dryRunResources(resources)` — Validate without applying
- `diffResources(desired, actual)` — Compare desired vs current cluster state

Uses `@kubernetes/client-node` patch API with `fieldManager: "mathison"` and `force: true`.

### 5. Convert All 5 Recipes

Convert each recipe from the current `seed-data.ts` Helm values templates to typed recipe modules:

| Recipe | Archetype | Complexity |
|--------|-----------|-----------|
| PostgreSQL | `database()` | Simple — StatefulSet + Service + Secret + PVC |
| Redis | `cache()` | Simple — StatefulSet + Service + Secret |
| Uptime Kuma | `webApp()` | Simple — Deployment + Service + PVC + Ingress |
| MinIO | `objectStore()` | Medium — StatefulSet + Service + Secret + PVC + dual Ingress |
| n8n | Custom `build()` | Complex — dependency wiring, worker mode toggle, encryption key |

For each recipe, study the current Helm values template and the Bitnami chart's generated resources to ensure we produce equivalent K8s resources.

### 6. Recipe Registry (`src/recipes/registry.ts`)

Central registry that:
- Exports all recipes
- Provides `getRecipe(slug)` and `listRecipes()` functions
- Validates recipe definitions at import time

## Key Files

```
src/recipes/
  _base/
    types.ts              # NEW — RecipeDefinition, BuildContext, etc.
    builders.ts           # NEW — K8s resource builder helpers
    archetypes/
      web-app.ts          # NEW — webApp() archetype
      database.ts         # NEW — database() archetype
      cache.ts            # NEW — cache() archetype
      object-store.ts     # NEW — objectStore() archetype
      index.ts            # NEW — re-exports
    apply.ts              # NEW — Server-Side Apply wrapper
    validate.ts           # NEW — recipe validation utilities
    index.ts              # NEW — re-exports
  postgresql/
    index.ts              # NEW — replaces seed-data.ts PostgreSQL entry
  redis/
    index.ts              # NEW — replaces seed-data.ts Redis entry
  n8n/
    index.ts              # NEW — replaces seed-data.ts n8n entry
  uptime-kuma/
    index.ts              # NEW — replaces seed-data.ts Uptime Kuma entry
  minio/
    index.ts              # NEW — replaces seed-data.ts MinIO entry
  registry.ts             # NEW — recipe lookup + list
```

## Testing

### Manual Verification

- [ ] `yarn typecheck` passes with all recipe modules
- [ ] Each recipe's `build()` produces valid K8s resource objects (unit test or manual inspection)
- [ ] Dry-run each recipe's output against the kind cluster (Server-Side Apply with `dryRun: ["All"]`)
- [ ] Recipe registry correctly discovers and lists all 5 recipes
- [ ] Archetype-based recipes produce resources equivalent to what the Helm charts generated

### Edge Cases

- [ ] Config schema defaults are applied correctly when no config is provided
- [ ] Secret generation produces cryptographically random values
- [ ] Builder helpers handle env vars from both plain values and secret refs
- [ ] Ingress resources are only generated when ingress is enabled in the context

## Notes

- This step creates the foundation but does NOT yet replace the Helm deployment flow. The old engine continues to work in parallel until Task 20 replaces it.
- Study the Bitnami chart templates (e.g., `helm template bitnami/postgresql`) to understand what K8s resources they generate. Our builders should produce equivalent resources for the features we use.
- The archetypes encode operational knowledge (security contexts, probes, labels, resource limits). Get these right — they'll be reused by every future recipe.
- Keep the builder helpers thin and composable. Complex recipes (n8n) should be able to use builders directly without going through an archetype.

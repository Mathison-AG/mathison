-- Change namespace convention from "{tenantSlug}-{workspaceSlug}" to "mathison-{workspaceId}"

-- Update workspace namespaces
UPDATE workspaces SET namespace = 'mathison-' || id;

-- Update deployment namespaces to match their workspace's new namespace
UPDATE deployments
SET namespace = w.namespace
FROM workspaces w
WHERE deployments.workspace_id = w.id;

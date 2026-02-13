/**
 * Values Template Rendering
 *
 * Renders Handlebars-style Helm values templates with deployment context:
 * config, secrets, dependency info, tenant metadata, and platform settings.
 */

import Handlebars from "handlebars";

// ─── Template context types ───────────────────────────────

export interface DependencyInfo {
  host: string;
  port: number;
  credentials: Record<string, string>;
}

export interface TemplateContext {
  config: Record<string, unknown>;
  secrets: Record<string, string>;
  deps: Record<string, DependencyInfo>;
  tenant: {
    slug: string;
    namespace: string;
  };
  platform: {
    domain: string;
    tlsEnabled: boolean;
    clusterIssuer: string;
  };
}

// ─── Template rendering ───────────────────────────────────

/**
 * Render a Handlebars values template with the provided context.
 *
 * Templates use placeholders like:
 *   {{config.version}}          — user-configurable values
 *   {{secrets.password}}        — auto-generated secrets
 *   {{deps.postgresql.host}}    — dependency connection info
 *   {{tenant.namespace}}        — tenant K8s namespace
 *   {{platform.domain}}         — platform base domain
 */
export function renderValuesTemplate(
  template: string,
  context: TemplateContext
): string {
  if (!template || template.trim() === "") {
    return "";
  }

  try {
    const compiled = Handlebars.compile(template, {
      noEscape: true, // Don't HTML-escape values in YAML
      strict: false,  // Don't throw on missing variables
    });

    return compiled(context);
  } catch (err) {
    console.error("[template] Failed to render values template:", err);
    throw new Error(
      `[template] Rendering failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Build the full template context for a deployment.
 * Merges user config with recipe defaults for any missing fields.
 */
export function buildTemplateContext(params: {
  config: Record<string, unknown>;
  configDefaults: Record<string, unknown>;
  secrets: Record<string, string>;
  deps: Record<string, DependencyInfo>;
  tenantSlug: string;
  tenantNamespace: string;
}): TemplateContext {
  // Merge user config with defaults (user values take precedence)
  const mergedConfig: Record<string, unknown> = {
    ...params.configDefaults,
    ...params.config,
  };

  return {
    config: mergedConfig,
    secrets: params.secrets,
    deps: params.deps,
    tenant: {
      slug: params.tenantSlug,
      namespace: params.tenantNamespace,
    },
    platform: {
      domain: process.env.MATHISON_BASE_DOMAIN || "localhost:3000",
      tlsEnabled: process.env.TLS_ENABLED === "true",
      clusterIssuer: process.env.TLS_CLUSTER_ISSUER || "letsencrypt-prod",
    },
  };
}

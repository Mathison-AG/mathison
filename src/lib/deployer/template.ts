/**
 * Values Template Rendering
 *
 * Renders Handlebars-style Helm values templates with deployment context:
 * config, secrets, dependency info, tenant metadata, and platform settings.
 */

import Handlebars from "handlebars";

// ─── Register custom Handlebars helpers ───────────────────

/** Block helper: {{#eq a b}}...{{else}}...{{/eq}} */
Handlebars.registerHelper(
  "eq",
  function (
    this: unknown,
    a: unknown,
    b: unknown,
    options: Handlebars.HelperOptions
  ) {
    if (a === b) {
      return options.fn(this);
    }
    return options.inverse(this);
  }
);

// ─── Template context types ───────────────────────────────

/**
 * Dependency connection info for template rendering.
 * All properties are top-level for easy access in templates:
 *   {{deps.n8n-db.host}}, {{deps.n8n-db.database}}, {{deps.n8n-db.password}}
 */
export interface DependencyInfo {
  host: string;
  port: number;
  /** Additional properties (database, username, password, etc.) */
  [key: string]: string | number;
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
  /** Cluster-level settings used in values templates (ingress, TLS, domain) */
  cluster: {
    domain: string;
    ingress_class: string;
    ingress_enabled: boolean;
    tls_cluster_issuer: string;
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
      strict: false // Don't throw on missing variables
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
    ...params.config
  };

  return {
    config: mergedConfig,
    secrets: params.secrets,
    deps: params.deps,
    tenant: {
      slug: params.tenantSlug,
      namespace: params.tenantNamespace
    },
    platform: {
      domain: process.env.MATHISON_BASE_DOMAIN || "localhost",
      tlsEnabled: process.env.TLS_ENABLED === "true",
      clusterIssuer: process.env.TLS_CLUSTER_ISSUER || "letsencrypt-prod"
    },
    cluster: {
      domain: process.env.MATHISON_BASE_DOMAIN || "localhost",
      ingress_class: process.env.INGRESS_CLASS || "nginx",
      ingress_enabled: process.env.INGRESS_ENABLED === "true",
      tls_cluster_issuer: process.env.TLS_CLUSTER_ISSUER || "letsencrypt-prod"
    }
  };
}

# Agent-Driven App Configuration

Users tell the agent what they want changed ("enable dark mode in Jira", "set backup interval to 6h in PostgreSQL") and the agent figures out which config to update, applies it, and ensures it takes effect — no YAML, no admin panels.

## Core Idea

- Agent has access to per-app configuration documentation (official docs, config references)
- Given a user request, the agent identifies the relevant config keys/files/env vars
- Agent updates the config through the appropriate mechanism (K8s ConfigMap, env vars, in-app API, config file)
- Agent triggers a reload or restart if needed and verifies the change took effect

## Open Questions

- Where to store/index app config docs? RAG over official docs? Curated per-recipe config schemas?
- Which config mechanisms per app? (env vars, config files mounted via ConfigMap, REST APIs, CLI commands)
- How to handle apps that need restart vs. hot-reload vs. API call?
- Auth: some apps require admin credentials to change settings — agent needs access to those
- Validation: how to prevent bad configs from breaking an app? Dry-run / rollback?
- Scope: start with recipe-level config (K8s layer) or also in-app settings (app's own admin API)?

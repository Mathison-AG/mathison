# Recipe Backlog

Living list of recipes to add to the catalog. Ordered by priority within each tier.
Update this file as recipes are added (move to "Completed" at the bottom).

---

## Currently in Catalog (5)

| Slug | Archetype | Category |
|------|-----------|----------|
| postgresql | database | database |
| redis | cache | database |
| n8n | custom build | automation |
| uptime-kuma | webApp | monitoring |
| minio | objectStore | storage |

---

## Tier 1 — Simple, No Dependencies

These apps are standalone (no DB, no Redis). Fastest to add and test.

| App | Slug | Archetype | Category | Notes |
|-----|------|-----------|----------|-------|
| Vaultwarden | `vaultwarden` | webApp | security | Bitwarden-compatible password manager. SQLite embedded. Single container. |
| Code Server | `code-server` | webApp | development | VS Code in the browser. Single container, persistent workspace. |
| Stirling PDF | `stirling-pdf` | webApp | productivity | PDF tools (merge, split, convert). Stateless or light storage. |
| IT Tools | `it-tools` | webApp | development | Developer utility toolbox. Stateless. Very simple. |
| Excalidraw | `excalidraw` | webApp | productivity | Collaborative whiteboard. Can be stateless (browser storage). |

## Tier 2 — Need Existing Dependencies (PostgreSQL/Redis)

These apps depend on PostgreSQL or Redis, both already in the catalog.

| App | Slug | Archetype | Category | Dependencies | Notes |
|-----|------|-----------|----------|--------------|-------|
| Gitea | `gitea` | webApp | development | PostgreSQL | Lightweight Git hosting. Well-documented Docker setup. |
| Metabase | `metabase` | webApp | analytics | PostgreSQL | BI dashboards. Simple env-var config. |
| Grafana | `grafana` | webApp | monitoring | — (optional) | Monitoring dashboards. Embedded SQLite or PostgreSQL. |
| Vikunja | `vikunja` | webApp | project-management | PostgreSQL | Lightweight task management. |
| Plausible | `plausible` | webApp | analytics | PostgreSQL | Privacy-friendly web analytics. |
| Ghostfolio | `ghostfolio` | webApp | analytics | PostgreSQL, Redis | Personal finance tracker. |

## Tier 3 — Need New Dependencies First

These apps need MySQL or MongoDB, which must be added as dependency recipes first.

| App | Slug | Archetype | Category | Dependencies | Notes |
|-----|------|-----------|----------|--------------|-------|
| **MySQL** | `mysql` | database | database | — | Prerequisite for Tier 3 apps. Bitnami image. |
| **MongoDB** | `mongodb` | database | database | — | Prerequisite for Rocket.Chat etc. Bitnami image. |
| BookStack | `bookstack` | webApp | knowledge | MySQL | Wiki/documentation. Needs MySQL specifically. |
| Rocket.Chat | `rocket-chat` | webApp | communication | MongoDB | Self-hosted Slack alternative. |

## Tier 4 — Complex / Multi-Component

These need custom `build()` or have complex architectures. Tackle after gaining more experience.

| App | Slug | Archetype | Category | Dependencies | Notes |
|-----|------|-----------|----------|--------------|-------|
| Nextcloud | `nextcloud` | webApp | media | PostgreSQL, Redis | Self-hosted cloud. Many features, complex config. |
| Outline | `outline` | webApp | knowledge | PostgreSQL, Redis, MinIO | Team wiki. 3 deps + OIDC setup. |
| Plane | `plane` | webApp | project-management | PostgreSQL, Redis, MinIO | Jira alternative. Complex multi-service architecture. |
| Immich | `immich` | custom | media | PostgreSQL, Redis | Photo management. Multiple containers (server, ML, microservices). |

---

## New Categories Needed

As recipes are added, these categories should be added to `src/components/catalog/catalog-filters.tsx`:

- `security` — when Vaultwarden is added
- `development` — when Code Server or Gitea is added
- `productivity` — when Stirling PDF or Excalidraw is added
- `project-management` — when Vikunja or Plane is added
- `knowledge` — when BookStack or Outline is added
- `communication` — when Rocket.Chat is added

---

## Completed

_Move recipes here as they're added to the catalog._

| Slug | Date | Notes |
|------|------|-------|
| — | — | — |

# Reference — Real-World Helm Values

These are working Helm values from the existing k8s infrastructure repo (`/Users/zentrale/IT/private/mathison/infra/k8s/`). Use these as a reference when writing seed recipe `valuesTemplate` in Step 04. These are battle-tested configs running on k3s with resource-conscious defaults.

## Bitnami PostgreSQL (`bitnami/postgresql`)

Source: `helmfile/values/n8n-postgresql.yaml`

```yaml
architecture: standalone

auth:
  database: n8n
  username: n8n
  # password injected via env

primary:
  resources:
    requests:
      cpu: 50m
      memory: 128Mi
    limits:
      cpu: 250m
      memory: 256Mi
  persistence:
    enabled: true
    size: 8Gi
    accessModes:
      - ReadWriteOnce
```

Key takeaways:
- `architecture: standalone` for single-instance (no replication)
- Resource requests are minimal (50m CPU, 128Mi memory)
- Persistence is always enabled for databases
- Auth section takes `database`, `username`, `password`

## n8n (`oci://8gears.container-registry.com/library/n8n`)

Source: `helmfile/values/n8n.yaml` + `helmfile.yaml.gotmpl`

```yaml
main:
  config:
    n8n:
      port: 5678
    db:
      type: postgresdb
      postgresdb:
        host: n8n-postgresql.n8n.svc.cluster.local
        port: 5432
        database: n8n
        user: n8n
        schema: public
  secret:
    n8n:
      encryption_key: <injected>
    db:
      postgresdb:
        password: <injected>
  resources:
    requests:
      cpu: 50m
      memory: 256Mi
    limits:
      cpu: 500m
      memory: 512Mi

persistence:
  enabled: false   # all state in PostgreSQL

worker:
  enabled: false   # queue mode disabled by default

webhook:
  enabled: false
```

Ingress pattern:
```yaml
ingress:
  enabled: true
  className: traefik
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
  hosts:
    - host: n8n.{{ requiredEnv "BASE_DOMAIN" }}
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: n8n-tls
      hosts:
        - n8n.{{ requiredEnv "BASE_DOMAIN" }}
```

Key takeaways:
- Config vs Secret separation: `main.config` for non-sensitive, `main.secret` for sensitive
- DB connection via K8s internal DNS: `<release>.<namespace>.svc.cluster.local`
- Persistence disabled when state lives in PostgreSQL
- Ingress uses cert-manager annotations for automatic TLS

## Monitoring (`prometheus-community/kube-prometheus-stack`)

Source: `helmfile/values/monitoring.yaml`

```yaml
prometheus:
  prometheusSpec:
    retention: 7d
    resources:
      requests: { cpu: 100m, memory: 256Mi }
      limits: { cpu: 500m, memory: 512Mi }
    storageSpec:
      volumeClaimTemplate:
        spec:
          accessModes: ["ReadWriteOnce"]
          resources:
            requests:
              storage: 10Gi

grafana:
  resources:
    requests: { cpu: 25m, memory: 64Mi }
    limits: { cpu: 150m, memory: 128Mi }
```

## Helmfile Patterns

Source: `helmfile.yaml.gotmpl`

- Repos defined at top: `bitnami`, `jetstack`, `prometheus-community`
- `helmDefaults: { wait: true, timeout: 300, createNamespace: true }`
- Dependencies via `needs:` — e.g., n8n `needs: [n8n/n8n-postgresql]`
- Secrets injected via `env` function: `{{ env "N8N_DB_PASSWORD" | default "changeme" }}`
- Ingress always includes: `className`, `cert-manager.io/cluster-issuer` annotation, TLS section

## Useful Resource Budget Reference

These are realistic minimums for k3s / small clusters:

| Service | CPU Request | Memory Request | CPU Limit | Memory Limit | Storage |
|---------|------------|---------------|-----------|-------------|---------|
| PostgreSQL | 50m | 128Mi | 250m | 256Mi | 8Gi |
| n8n | 50m | 256Mi | 500m | 512Mi | — |
| Redis | 25m | 64Mi | 100m | 128Mi | 1Gi |
| Grafana | 25m | 64Mi | 150m | 128Mi | — |
| Prometheus | 100m | 256Mi | 500m | 512Mi | 10Gi |
| cert-manager | 10m | 32Mi | 100m | 64Mi | — |

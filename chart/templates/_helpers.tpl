{{/*
Chart name, truncated to 63 chars.
*/}}
{{- define "mathison.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Fully qualified app name.
If fullnameOverride is set, use that. Otherwise combine release name + chart name,
unless they're the same (avoid "mathison-mathison").
*/}}
{{- define "mathison.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Standard labels applied to every resource.
*/}}
{{- define "mathison.labels" -}}
helm.sh/chart: {{ include "mathison.chart" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/part-of: mathison
{{ include "mathison.selectorLabels" . }}
{{- end }}

{{/*
Selector labels (shared by deployment spec.selector and pod template).
*/}}
{{- define "mathison.selectorLabels" -}}
app.kubernetes.io/name: {{ include "mathison.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Chart label value: name-version.
*/}}
{{- define "mathison.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
ServiceAccount name.
*/}}
{{- define "mathison.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "mathison.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Secret name — either an existing one or the generated one.
*/}}
{{- define "mathison.secretName" -}}
{{- if .Values.secrets.existingSecret }}
{{- .Values.secrets.existingSecret }}
{{- else }}
{{- include "mathison.fullname" . }}
{{- end }}
{{- end }}

{{/*
ConfigMap name.
*/}}
{{- define "mathison.configMapName" -}}
{{- include "mathison.fullname" . }}
{{- end }}

{{/*
Resolve the image reference, prepending global registry if set.
Usage: {{ include "mathison.image" (dict "image" .Values.image.web "global" .Values.global "chart" .Chart) }}
*/}}
{{- define "mathison.image" -}}
{{- $tag := default .chart.AppVersion .image.tag -}}
{{- if .global.imageRegistry -}}
{{- printf "%s/%s:%s" .global.imageRegistry .image.repository $tag -}}
{{- else -}}
{{- printf "%s:%s" .image.repository $tag -}}
{{- end -}}
{{- end }}

{{/* ── Computed connection strings ──────────────────────────────── */}}

{{/*
PostgreSQL host — internal service or external.
*/}}
{{- define "mathison.postgresql.host" -}}
{{- if .Values.postgresql.enabled }}
{{- printf "%s-postgres.%s.svc.cluster.local" (include "mathison.fullname" .) .Release.Namespace }}
{{- else }}
{{- .Values.postgresql.external.host }}
{{- end }}
{{- end }}

{{/*
PostgreSQL port.
*/}}
{{- define "mathison.postgresql.port" -}}
{{- if .Values.postgresql.enabled }}
{{- "5432" }}
{{- else }}
{{- .Values.postgresql.external.port | toString }}
{{- end }}
{{- end }}

{{/*
PostgreSQL database name.
*/}}
{{- define "mathison.postgresql.database" -}}
{{- if .Values.postgresql.enabled }}
{{- "mathison" }}
{{- else }}
{{- .Values.postgresql.external.database }}
{{- end }}
{{- end }}

{{/*
PostgreSQL user.
*/}}
{{- define "mathison.postgresql.user" -}}
{{- if .Values.postgresql.enabled }}
{{- "mathison" }}
{{- else }}
{{- .Values.postgresql.external.user }}
{{- end }}
{{- end }}

{{/*
Redis URL — internal service or external.
*/}}
{{- define "mathison.redis.url" -}}
{{- if .Values.redis.enabled }}
{{- printf "redis://%s-redis.%s.svc.cluster.local:6379" (include "mathison.fullname" .) .Release.Namespace }}
{{- else }}
{{- .Values.redis.external.url }}
{{- end }}
{{- end }}

{{/* Базовое имя и метки релиза. */}}
{{- define "helm.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "helm.fullname" -}}
{{- default (printf "%s-%s" .Release.Name (include "helm.name" .)) .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/* Имя компонента: например agile-helm-backend. */}}
{{- define "helm.componentName" -}}
{{- $component := index .root.Values .component -}}
{{- $base := include "helm.fullname" .root | trunc 54 | trimSuffix "-" -}}
{{- default (printf "%s-%s" $base .component) $component.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "helm.selectorLabels" -}}
app.kubernetes.io/name: {{ include "helm.name" .root }}
app.kubernetes.io/instance: {{ .root.Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end -}}

{{- define "helm.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .root.Chart.Name .root.Chart.Version | replace "+" "_" | quote }}
{{ include "helm.selectorLabels" . }}
app.kubernetes.io/managed-by: {{ .root.Release.Service }}
{{- end -}}

{{- define "helm.image" -}}
{{- $image := (index .root.Values .component).image -}}
{{- $repository := $image.repository -}}
{{- if .root.Values.global.registry -}}
{{- $repository = printf "%s/%s" (trimSuffix "/" .root.Values.global.registry) (trimPrefix "/" $repository) -}}
{{- end -}}
{{- printf "%s:%s" $repository $image.tag -}}
{{- end -}}

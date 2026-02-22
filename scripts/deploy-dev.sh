#!/usr/bin/env bash
# Deploy Mathison to a cloud cluster from your local machine.
#
# Usage:
#   ./scripts/deploy-dev.sh              # Build all images + deploy chart
#   ./scripts/deploy-dev.sh web          # Rebuild only web + deploy
#   ./scripts/deploy-dev.sh web worker   # Rebuild web + worker + deploy
#   ./scripts/deploy-dev.sh --chart-only # Deploy chart only (reuse existing images)
#   ./scripts/deploy-dev.sh --dry-run    # Show what helm would do
#
# Prerequisites:
#   - Docker logged into GHCR: echo $GHCR_TOKEN | docker login ghcr.io -u USERNAME --password-stdin
#   - kubectl context set to your cloud cluster
#   - helm 3 installed
#   - values-dev.yaml exists (copy from values-dev.yaml.example)

set -euo pipefail

# ── Configuration (override via environment) ──────────────────

REGISTRY="${MATHISON_REGISTRY:-ghcr.io/mathison-ag}"
NAMESPACE="${MATHISON_NAMESPACE:-mathison}"
RELEASE="${MATHISON_RELEASE:-mathison}"
VALUES_FILE="${MATHISON_VALUES:-values-dev.yaml}"
PLATFORM="${MATHISON_PLATFORM:-linux/amd64}"

# ── Colors ────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}▸${NC} $*"; }
ok()    { echo -e "${GREEN}✓${NC} $*"; }
warn()  { echo -e "${YELLOW}⚠${NC} $*"; }
die()   { echo -e "${RED}✗${NC} $*" >&2; exit 1; }

# ── Parse arguments ───────────────────────────────────────────

CHART_ONLY=false
DRY_RUN=false
TARGETS=()

while [[ $# -gt 0 ]]; do
  case $1 in
    --chart-only) CHART_ONLY=true; shift ;;
    --dry-run)    DRY_RUN=true; shift ;;
    --help|-h)
      head -14 "$0" | tail -13
      exit 0
      ;;
    web|worker|migrate)
      TARGETS+=("$1"); shift ;;
    *)
      die "Unknown argument: $1 (use --help)" ;;
  esac
done

# Default: build all three if no targets specified
if [[ ${#TARGETS[@]} -eq 0 ]] && [[ "$CHART_ONLY" == false ]]; then
  TARGETS=(web worker migrate)
fi

# ── Checks ────────────────────────────────────────────────────

command -v docker >/dev/null || die "docker not found"
command -v helm >/dev/null   || die "helm not found"
command -v kubectl >/dev/null || die "kubectl not found"

if [[ ! -f "$VALUES_FILE" ]]; then
  die "$VALUES_FILE not found. Copy from values-dev.yaml.example and fill in your values."
fi

KUBE_CONTEXT=$(kubectl config current-context 2>/dev/null || true)
if [[ -z "$KUBE_CONTEXT" ]]; then
  die "No active kubectl context. Set one with: kubectl config use-context <context>"
fi

# Safety: warn if pointing at a production-looking context
if [[ "$KUBE_CONTEXT" == *"prod"* ]]; then
  warn "kubectl context looks like production: $KUBE_CONTEXT"
  read -r -p "Continue? [y/N] " confirm
  [[ "$confirm" =~ ^[Yy]$ ]] || exit 1
fi

# ── Tag ───────────────────────────────────────────────────────

GIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
GIT_DIRTY=""
if ! git diff --quiet 2>/dev/null; then
  GIT_DIRTY="-dirty"
fi
TAG="dev-${GIT_SHA}${GIT_DIRTY}"

echo ""
echo -e "${BLUE}╭──────────────────────────────────────╮${NC}"
echo -e "${BLUE}│${NC}  Mathison Dev Deploy                 ${BLUE}│${NC}"
echo -e "${BLUE}╰──────────────────────────────────────╯${NC}"
echo ""
info "Context:   $KUBE_CONTEXT"
info "Namespace: $NAMESPACE"
info "Release:   $RELEASE"
info "Tag:       $TAG"
info "Registry:  $REGISTRY"
if [[ "$CHART_ONLY" == true ]]; then
  info "Mode:      chart-only (no image builds)"
else
  info "Targets:   ${TARGETS[*]}"
fi
echo ""

# ── Build + Push images ──────────────────────────────────────

if [[ "$CHART_ONLY" == false ]]; then
  for target in "${TARGETS[@]}"; do
    IMAGE="${REGISTRY}/mathison-${target}:${TAG}"
    info "Building ${target} → ${IMAGE}"

    SECONDS=0
    docker buildx build \
      --platform "$PLATFORM" \
      --push \
      -f "Dockerfile.${target}" \
      -t "$IMAGE" \
      . 2>&1 | tail -5

    ok "Built + pushed ${target} (${SECONDS}s)"
    echo ""
  done
fi

# ── Helm upgrade ─────────────────────────────────────────────

HELM_ARGS=(
  upgrade --install "$RELEASE" ./chart/
  --namespace "$NAMESPACE"
  --create-namespace
  -f "$VALUES_FILE"
  --set "image.web.pullPolicy=Always"
  --set "image.worker.pullPolicy=Always"
  --set "image.migrate.pullPolicy=Always"
)

if [[ "$CHART_ONLY" == false ]]; then
  # Point to the images we just built
  for target in "${TARGETS[@]}"; do
    HELM_ARGS+=(--set "image.${target}.tag=${TAG}")
  done
else
  info "Chart-only mode — using image tags from $VALUES_FILE"
fi

if [[ "$DRY_RUN" == true ]]; then
  HELM_ARGS+=(--dry-run --debug)
  warn "Dry run — no changes will be applied"
fi

info "Running helm upgrade..."
echo ""
helm "${HELM_ARGS[@]}"
echo ""

# ── Status ───────────────────────────────────────────────────

if [[ "$DRY_RUN" == false ]]; then
  ok "Deploy complete!"
  echo ""
  info "Watch rollout:"
  echo "  kubectl -n $NAMESPACE rollout status deployment/${RELEASE}-web"
  echo "  kubectl -n $NAMESPACE rollout status deployment/${RELEASE}-worker"
  echo ""
  info "Check pods:"
  echo "  kubectl -n $NAMESPACE get pods"
  echo ""
  info "Logs:"
  echo "  kubectl -n $NAMESPACE logs -f deployment/${RELEASE}-web"
  echo "  kubectl -n $NAMESPACE logs -f deployment/${RELEASE}-worker"
fi

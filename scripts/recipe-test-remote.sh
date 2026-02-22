#!/usr/bin/env bash
# Remote recipe testing — port-forwards to the remote cluster, then runs recipe-test.ts locally.
#
# Prerequisites:
#   - KUBECONFIG pointing to your remote cluster (or set in .env.remote)
#   - values-dev.yaml present (for DB password extraction)
#   - Host setup: yarn install && npx prisma generate (one-time)
#
# Usage:
#   KUBECONFIG=~/.kube/remote ./scripts/recipe-test-remote.sh <slug> [--fresh] [--cleanup]
#
#   Or for convenience, create .env.remote with KUBECONFIG= and run:
#   yarn recipe:test:remote <slug> [--fresh] [--cleanup]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# ── Configuration ────────────────────────────────────────

NAMESPACE="${MATHISON_NAMESPACE:-mathison}"
RELEASE="${MATHISON_RELEASE:-mathison}"
VALUES_FILE="${MATHISON_VALUES:-values-dev.yaml}"

PG_LOCAL_PORT="${MATHISON_PG_LOCAL_PORT:-15432}"
REDIS_LOCAL_PORT="${MATHISON_REDIS_LOCAL_PORT:-16379}"

# ── Colors ───────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}▸${NC} $*"; }
ok()    { echo -e "${GREEN}✓${NC} $*"; }
warn()  { echo -e "${YELLOW}⚠${NC} $*"; }
die()   { echo -e "${RED}✗${NC} $*" >&2; exit 1; }

# ── Load .env.remote if it exists ────────────────────────

if [[ -f ".env.remote" ]]; then
  set -a
  # shellcheck source=/dev/null
  source .env.remote
  set +a
fi

# ── Checks ───────────────────────────────────────────────

if [[ -z "${KUBECONFIG:-}" ]]; then
  die "KUBECONFIG not set. Either export it or add it to .env.remote"
fi

if [[ ! -f "$KUBECONFIG" ]]; then
  die "KUBECONFIG file not found: $KUBECONFIG"
fi

command -v kubectl >/dev/null || die "kubectl not found"

if ! command -v tsx >/dev/null 2>&1; then
  if [[ -x "node_modules/.bin/tsx" ]]; then
    PATH="$PROJECT_ROOT/node_modules/.bin:$PATH"
  else
    die "tsx not found. Run: yarn install"
  fi
fi

if [[ ! -d "node_modules" ]]; then
  die "node_modules not found. Run: yarn install"
fi

if [[ ! -d "src/generated/prisma" ]]; then
  die "Prisma client not generated. Run: npx prisma generate"
fi

KUBE_CONTEXT=$(kubectl config current-context 2>/dev/null || true)
if [[ -z "$KUBE_CONTEXT" ]]; then
  die "Cannot determine kubectl context from KUBECONFIG=$KUBECONFIG"
fi

if [[ ! -f "$VALUES_FILE" ]]; then
  die "$VALUES_FILE not found — needed to read the database password."
fi

# ── Extract DB password ──────────────────────────────────

PG_PASSWORD=$(grep 'postgresPassword:' "$VALUES_FILE" | head -1 | sed 's/.*: *"\([^"]*\)".*/\1/')
if [[ -z "$PG_PASSWORD" ]]; then
  die "Could not extract postgresPassword from $VALUES_FILE"
fi

# ── Banner ───────────────────────────────────────────────

echo ""
echo -e "${BLUE}╭──────────────────────────────────────╮${NC}"
echo -e "${BLUE}│${NC}  Mathison Remote Recipe Test          ${BLUE}│${NC}"
echo -e "${BLUE}╰──────────────────────────────────────╯${NC}"
echo ""
info "KUBECONFIG: $KUBECONFIG"
info "Context:    $KUBE_CONTEXT"
info "Namespace:  $NAMESPACE"
info "PG:         localhost:$PG_LOCAL_PORT → ${RELEASE}-postgres:5432"
info "Redis:      localhost:$REDIS_LOCAL_PORT → ${RELEASE}-redis:6379"
info "Args:       ${*:-(none)}"
echo ""

# ── Port-Forward Management ──────────────────────────────

PG_PID=""
REDIS_PID=""

cleanup() {
  local exit_code=$?
  echo ""
  if [[ -n "$PG_PID" ]] || [[ -n "$REDIS_PID" ]]; then
    info "Stopping port-forwards..."
    kill "$PG_PID" "$REDIS_PID" 2>/dev/null || true
    wait "$PG_PID" "$REDIS_PID" 2>/dev/null || true
    ok "Port-forwards stopped."
  fi
  exit "$exit_code"
}
trap cleanup EXIT INT TERM

info "Starting port-forward: PostgreSQL..."
kubectl port-forward "svc/${RELEASE}-postgres" "${PG_LOCAL_PORT}:5432" \
  -n "$NAMESPACE" --address 127.0.0.1 >/dev/null 2>&1 &
PG_PID=$!

info "Starting port-forward: Redis..."
kubectl port-forward "svc/${RELEASE}-redis" "${REDIS_LOCAL_PORT}:6379" \
  -n "$NAMESPACE" --address 127.0.0.1 >/dev/null 2>&1 &
REDIS_PID=$!

sleep 2

if ! kill -0 "$PG_PID" 2>/dev/null; then
  die "PostgreSQL port-forward died. Check: kubectl -n $NAMESPACE get svc ${RELEASE}-postgres"
fi
if ! kill -0 "$REDIS_PID" 2>/dev/null; then
  die "Redis port-forward died. Check: kubectl -n $NAMESPACE get svc ${RELEASE}-redis"
fi

ok "Port-forwards established."
echo ""

# ── Run the Recipe Test ──────────────────────────────────

DATABASE_URL="postgresql://mathison:${PG_PASSWORD}@localhost:${PG_LOCAL_PORT}/mathison" \
REDIS_URL="redis://localhost:${REDIS_LOCAL_PORT}" \
MATHISON_REMOTE=1 \
  tsx scripts/recipe-test.ts "$@"

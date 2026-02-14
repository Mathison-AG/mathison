#!/bin/sh
set -e

# ─── Kubeconfig rewrite for Docker-to-host connectivity ───
#
# Kind cluster API server listens on 127.0.0.1:<port> on the host.
# From inside Docker, 127.0.0.1 is the container's loopback — not the host.
# We rewrite the server URL to use host.docker.internal (Docker Desktop).
# We also skip TLS verify since the certificate SANs don't include that hostname.

if [ -f /root/.kube/config ]; then
  mkdir -p /tmp/kube
  sed \
    -e 's/127\.0\.0\.1/host.docker.internal/g' \
    -e '/certificate-authority-data:/c\    insecure-skip-tls-verify: true' \
    /root/.kube/config > /tmp/kube/config
  export KUBECONFIG=/tmp/kube/config
  echo "[entrypoint] Kubeconfig rewritten for Docker (host.docker.internal)"
fi

exec "$@"

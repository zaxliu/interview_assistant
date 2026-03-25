#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

TRANSFER_DIR="${TRANSFER_DIR:-/tmp/interview_assitant_transfer}"
TRANSFER_NAME="${TRANSFER_NAME:-interview_assitant.tar.gz}"
TRANSFER_IMAGE="${TRANSFER_IMAGE:-hub.hobot.cc/carsim/interview_assitant-transfer:latest}"
TRANSFER_DOCKERFILE="${TRANSFER_DOCKERFILE:-${TRANSFER_DIR}/Dockerfile.transfer}"

mkdir -p "${TRANSFER_DIR}"

if [[ ! -f "${TRANSFER_DOCKERFILE}" ]]; then
  cat > "${TRANSFER_DOCKERFILE}" <<'EOF'
FROM hub.hobot.cc/carsim/node@sha256:eb29363371ee2859fad6a3c5af88d4abc6ff7d399addb13b7de3c1f11bdee6b9
WORKDIR /payload
COPY interview_assitant.tar.gz /payload/
EOF
fi

tar -czf "${TRANSFER_DIR}/${TRANSFER_NAME}" \
  -C "${REPO_ROOT}" \
  package.json \
  package-lock.json \
  tsconfig.json \
  tsconfig.node.json \
  vite.config.ts \
  index.html \
  Dockerfile \
  .dockerignore \
  .gitignore \
  .env.example \
  docker-compose.yml \
  nginx.conf.template \
  docker-entrypoint.sh \
  postcss.config.js \
  tailwind.config.js \
  eslint.config.mjs \
  public \
  src \
  scripts

docker build \
  -f "${TRANSFER_DOCKERFILE}" \
  -t "${TRANSFER_IMAGE}" \
  "${TRANSFER_DIR}"

docker push "${TRANSFER_IMAGE}"

echo "Transfer image pushed: ${TRANSFER_IMAGE}"

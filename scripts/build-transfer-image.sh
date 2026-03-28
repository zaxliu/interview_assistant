#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

TRANSFER_DIR="${TRANSFER_DIR:-/tmp/interview_assitant_transfer}"
TRANSFER_NAME="${TRANSFER_NAME:-interview_assitant.tar.gz}"
TRANSFER_IMAGE="${TRANSFER_IMAGE:-hub.hobot.cc/carsim/interview_assitant-transfer:latest}"
TRANSFER_DOCKERFILE="${TRANSFER_DOCKERFILE:-${TRANSFER_DIR}/Dockerfile.transfer}"

mkdir -p "${TRANSFER_DIR}"

printf '%s\n' \
'FROM scratch' \
'WORKDIR /payload' \
'COPY interview_assitant.tar.gz /payload/' \
> "${TRANSFER_DOCKERFILE}"

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
  docker-compose.override.yml \
  docker-compose.prod.yml \
  nginx.conf.template \
  nginx.https.conf.template \
  docker-entrypoint.sh \
  postcss.config.js \
  tailwind.config.js \
  eslint.config.mjs \
  README.md \
  docs \
  public \
  src \
  scripts

docker build \
  -f "${TRANSFER_DOCKERFILE}" \
  -t "${TRANSFER_IMAGE}" \
  "${TRANSFER_DIR}"

docker push "${TRANSFER_IMAGE}"

echo "Transfer image pushed: ${TRANSFER_IMAGE}"

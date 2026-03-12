#!/bin/sh
set -eu

if [ -n "${VITE_AI_BASE_URL:-}" ]; then
  export VITE_AI_BASE_URL="${VITE_AI_BASE_URL%/}"
fi

if [ -n "${VITE_WINTALENT_PROXY_URL:-}" ]; then
  export VITE_WINTALENT_PROXY_URL="${VITE_WINTALENT_PROXY_URL%/}"
fi

exec /docker-entrypoint.sh "$@"

#!/bin/sh
set -eu

if [ -n "${VITE_AI_BASE_URL:-}" ]; then
  export VITE_AI_BASE_URL="${VITE_AI_BASE_URL%/}"
fi

exec /docker-entrypoint.sh "$@"

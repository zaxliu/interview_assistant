#!/bin/sh
set -eu

export NGINX_SERVER_NAME="${NGINX_SERVER_NAME:-localhost}"
export NGINX_TLS_CERT_PATH="${NGINX_TLS_CERT_PATH:-/etc/nginx/certs/server.crt}"
export NGINX_TLS_KEY_PATH="${NGINX_TLS_KEY_PATH:-/etc/nginx/certs/server.key}"

if [ -n "${VITE_AI_BASE_URL:-}" ]; then
  export VITE_AI_BASE_URL="${VITE_AI_BASE_URL%/}"
fi

if [ -n "${VITE_WINTALENT_PROXY_URL:-}" ]; then
  export VITE_WINTALENT_PROXY_URL="${VITE_WINTALENT_PROXY_URL%/}"
fi

if [ -n "${VITE_METRICS_PROXY_URL:-}" ]; then
  export VITE_METRICS_PROXY_URL="${VITE_METRICS_PROXY_URL%/}"
fi

template_name=http
if [ "${NGINX_ENABLE_TLS:-0}" = "1" ] || [ "${NGINX_ENABLE_TLS:-}" = "true" ]; then
  if [ ! -f "${NGINX_TLS_CERT_PATH}" ]; then
    echo "TLS certificate file not found: ${NGINX_TLS_CERT_PATH}" >&2
    exit 1
  fi

  if [ ! -f "${NGINX_TLS_KEY_PATH}" ]; then
    echo "TLS private key file not found: ${NGINX_TLS_KEY_PATH}" >&2
    exit 1
  fi

  template_name=https
fi

mkdir -p /etc/nginx/templates
cp "/opt/interview-assistant/nginx/${template_name}.conf.template" /etc/nginx/templates/default.conf.template

exec /docker-entrypoint.sh "$@"

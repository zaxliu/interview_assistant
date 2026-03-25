#!/usr/bin/env bash

set -euo pipefail

TRANSFER_IMAGE="${1:-hub.hobot.cc/carsim/interview_assitant-transfer:latest}"
DEST_DIR="${2:-./interview_assitant_src}"
CONTAINER_NAME="interview_assistant_transfer_$$"
ARCHIVE_NAME="interview_assitant.tar.gz"

mkdir -p "${DEST_DIR}"

docker pull "${TRANSFER_IMAGE}"
docker create --name "${CONTAINER_NAME}" "${TRANSFER_IMAGE}" >/dev/null
trap 'docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true' EXIT

docker cp "${CONTAINER_NAME}:/payload/${ARCHIVE_NAME}" "${DEST_DIR}/${ARCHIVE_NAME}"
tar -xzf "${DEST_DIR}/${ARCHIVE_NAME}" -C "${DEST_DIR}"

echo "Transfer archive extracted to: ${DEST_DIR}"

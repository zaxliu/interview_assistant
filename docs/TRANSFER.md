# Transfer Packaging

Use this flow when you need to ship the repository source through a registry image and unpack it on another machine.

## Build And Push

```bash
scripts/build-transfer-image.sh
```

Optional environment variables:

```bash
TRANSFER_DIR=/tmp/interview_assitant_transfer
TRANSFER_IMAGE=hub.hobot.cc/carsim/interview_assitant-transfer:latest
TRANSFER_DOCKERFILE=/tmp/interview_assitant_transfer/Dockerfile.transfer
```

What gets packed:

- Frontend and server source under `src/`, `public/`, and `scripts/`
- Build and Docker files such as `Dockerfile`, `docker-compose.yml`, `.env.example`, `nginx.conf.template`
- Node and TypeScript config files required to rebuild the app

What is intentionally excluded:

- `.git`, `node_modules`, `dist`, coverage output, local `.env`, and other local-only artifacts

## Extract On Target Machine

```bash
scripts/extract-transfer-image.sh
```

Or specify image and destination explicitly:

```bash
scripts/extract-transfer-image.sh \
  hub.hobot.cc/carsim/interview_assitant-transfer:latest \
  ./interview_assitant_src
```

The extract script will:

- pull the transfer image
- copy `/payload/interview_assitant.tar.gz` out of the image
- extract the archive into the target directory

## Start With Docker Compose

```bash
cd interview_assitant_src
cp .env.example .env
docker compose up --build
```

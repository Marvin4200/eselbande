# Stage 1: pull Docker CLI + Compose plugin (used by deploy-webhook & eseltokens-webhook containers)
FROM docker:27-cli AS docker-cli

# Stage 2: application image
FROM node:22-bookworm-slim

WORKDIR /app

# Docker CLI binary and Compose plugin — needed so webhook scripts can call `docker compose`
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker-cli /usr/local/libexec/docker/cli-plugins/docker-compose /usr/local/libexec/docker/cli-plugins/docker-compose

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ default-mysql-client \
  && rm -rf /var/lib/apt/lists/*

COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY --chown=node:node . .

ENV NODE_ENV=production
USER node
CMD ["node", "index.js"]

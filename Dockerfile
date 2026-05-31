# Multi-stage Dockerfile for the pain-server service
# Builds the TypeScript app, installs Python 3.11, and produces a smaller runtime image.

FROM node:20-bookworm-slim AS frontend-builder

WORKDIR /frontend
COPY pain-frontend/package*.json ./
RUN npm ci
COPY pain-frontend/ .
RUN npm run build

FROM node:20-bookworm-slim AS builder

# Install Python 3.11 and pip for later Python script support
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3.11 python3.11-venv python3-pip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Install Node dependencies and build the TypeScript app
COPY pain-server/package*.json pain-server/tsconfig.json ./
RUN npm ci

COPY pain-server/ .
RUN mkdir -p data   # create an empty data folder if it does not exist
RUN npm run build

# Runtime image
FROM node:20-bookworm-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3.11 python3.11-venv python3-pip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY pain-server/package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/data ./data
COPY --from=frontend-builder /frontend/dist ./dist/public
COPY pain-setup/db-config.env ./
COPY pain-server/server.env ./

EXPOSE 3000

CMD ["node", "--env-file=./db-config.env", "--env-file=./server.env", "dist/index.js"]

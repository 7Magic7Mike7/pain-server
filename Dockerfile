# Multi-stage Dockerfile for the pain-server service
# Builds the TypeScript app, installs Python 3.11, and produces a smaller runtime image.

FROM node:20-bookworm-slim AS builder

# Install Python 3.11 and pip for later Python script support
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3.11 python3.11-venv python3-pip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Install Node dependencies and build the TypeScript app
COPY package*.json tsconfig.json ./
RUN npm ci

COPY . .
RUN npm run build

# Runtime image
FROM node:20-bookworm-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3.11 python3.11-venv python3-pip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/data ./data

EXPOSE 3000

CMD ["node", "dist/index.js"]

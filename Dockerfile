# File attribution
# edited by Christian Stelmach (chrisp.stel@gmail.com), GitHub: @cstelmach
# Multi-stage Dockerfile for the pain-server service
# Builds the TypeScript app. The separate message service owns the Python runtime.

FROM node:24-bookworm-slim AS frontend-builder

WORKDIR /frontend
COPY pain-frontend/package*.json ./
RUN npm ci
COPY pain-frontend/ .
RUN npm run build
RUN printf 'FRONTEND_VERSION=%s\n' "$(node -p "require('./package.json').version")" > /frontend-version.env

FROM node:24-bookworm-slim AS builder

WORKDIR /usr/src/app

# Install Node dependencies and build the TypeScript app
COPY pain-server/package*.json pain-server/tsconfig.json ./
RUN npm ci

COPY pain-server/ .
RUN mkdir -p data   # create an empty data folder if it does not exist
RUN npm run build

# Runtime image
FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production DEV=false

WORKDIR /usr/src/app

COPY pain-server/package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/data ./data
COPY --from=frontend-builder /frontend/dist ./dist/public
COPY --from=frontend-builder /frontend-version.env ./frontend-version.env
COPY pain-setup/db-config.env ./
COPY pain-server/server.env ./

EXPOSE 3000

CMD ["node", "--env-file=./db-config.env", "--env-file=./server.env", "--env-file=./frontend-version.env", "dist/index.js"]

# Production image for the mini app, built by Dokploy on moscow (infra-msk-01-build)
# and pulled by buffalo. Multi-stage: the runtime image carries only Bun, the
# production dependencies, the server source and the built client. Railpack's
# image (~825 MB) also shipped mise, a second toolchain and every dev dependency.
ARG BUN_VERSION=1.3.3
ARG NODE_VERSION=22.21.1

FROM oven/bun:${BUN_VERSION} AS bun

# Vite and its plugins run under Node (their bins are `#!/usr/bin/env node`);
# under Bun, vite-plugin-svgo's default export resolves to undefined.
FROM node:${NODE_VERSION}-slim AS deps
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json bun.lock ./
COPY client/package.json client/
COPY server/package.json server/
RUN bun install --frozen-lockfile

FROM deps AS build
COPY . .
RUN bun run --cwd client build

FROM bun AS prod-deps
WORKDIR /app
COPY package.json bun.lock ./
COPY client/package.json client/
COPY server/package.json server/
RUN bun install --frozen-lockfile --production

FROM oven/bun:${BUN_VERSION}-slim
WORKDIR /app
ENV NODE_ENV=production
# package.json files and node_modules (root and per-workspace) from the production install.
COPY --from=prod-deps /app ./
COPY tsconfig.base.json ./
COPY server/tsconfig.json ./server/
COPY server/src ./server/src
COPY --from=build /app/client/dist ./client/dist
USER bun
EXPOSE 8000
CMD ["bun", "run", "server/src/index.ts"]

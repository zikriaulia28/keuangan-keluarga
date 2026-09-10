FROM oven/bun:1 AS base
WORKDIR /app

COPY package.json bun.lock ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/db/package.json ./packages/db/package.json
RUN bun install --production --filter api

COPY apps/api ./apps/api
COPY packages/db ./packages/db

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["bun", "apps/api/src/index.ts"]

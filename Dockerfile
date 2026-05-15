# Raíz del repo: EasyPanel (y otros) suelen ejecutar `docker build` aquí.
# Construye solo el API Nest. Para el front: Dockerfile.web en esta misma raíz.
# Para web + Postgres + Minio + Redis use docker-compose.yml (proyecto Compose en EasyPanel).
FROM node:20-bookworm-slim AS build
WORKDIR /app
ARG BUILD_GIT_SHA=unknown
ARG BUILD_TIME=unknown
ARG BUILD_SOURCE=dockerfile-root-api

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY apps/api/package*.json ./
# ts-jest pide typescript<6; el proyecto usa TS 6 — npm ci falla sin legacy-peer-deps
RUN npm ci --legacy-peer-deps

COPY apps/api/ ./
RUN npm run prisma:generate && npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
# ARG debe declararse en cada etapa; si no, `${BUILD_*}` en ENV es “undefined” para BuildKit.
ARG BUILD_GIT_SHA=unknown
ARG BUILD_TIME=unknown
ARG BUILD_SOURCE=dockerfile-root-api
ENV NODE_ENV=production
ENV BUILD_GIT_SHA=${BUILD_GIT_SHA}
ENV BUILD_TIME=${BUILD_TIME}
ENV BUILD_SOURCE=${BUILD_SOURCE}

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 3030
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:3030/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["./docker-entrypoint.sh"]

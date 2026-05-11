# Raíz del repo: EasyPanel (y otros) suelen ejecutar `docker build` aquí.
# Construye solo el API Nest. Para web + Postgres + Minio + Redis use docker-compose.yml (proyecto Compose en EasyPanel).
FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY apps/api/package*.json ./
RUN npm ci

COPY apps/api/ ./
RUN npm run prisma:generate && npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 3030
CMD ["./docker-entrypoint.sh"]

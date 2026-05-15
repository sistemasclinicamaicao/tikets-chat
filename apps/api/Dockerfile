FROM node:20-bookworm-slim AS build
WORKDIR /app
ARG BUILD_GIT_SHA=unknown
ARG BUILD_TIME=unknown
ARG BUILD_SOURCE=apps-api-dockerfile

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --legacy-peer-deps

COPY . .
RUN npm run prisma:generate && npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ARG BUILD_GIT_SHA=unknown
ARG BUILD_TIME=unknown
ARG BUILD_SOURCE=apps-api-dockerfile
ENV NODE_ENV=production
ENV BUILD_GIT_SHA=${BUILD_GIT_SHA}
ENV BUILD_TIME=${BUILD_TIME}
ENV BUILD_SOURCE=${BUILD_SOURCE}

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 3030
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:3030/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["./docker-entrypoint.sh"]

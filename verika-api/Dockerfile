# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY verika-api/package.json ./verika-api/

RUN npm ci --workspace=@internal/verika-api --workspace=@internal/verika-shared

COPY packages/shared/ ./packages/shared/
COPY verika-api/ ./verika-api/
COPY tsconfig.json ./

RUN npm run build --workspace=@internal/verika-shared
RUN npm run build --workspace=@internal/verika-api

# Production stage
FROM node:20-alpine AS production
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/package.json ./
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/shared/dist/ ./packages/shared/dist/
COPY --from=builder /app/verika-api/package.json ./verika-api/
COPY --from=builder /app/verika-api/dist/ ./verika-api/dist/

RUN npm ci --workspace=@internal/verika-api --workspace=@internal/verika-shared --omit=dev

USER node

EXPOSE 8080

CMD ["node", "verika-api/dist/index.js"]

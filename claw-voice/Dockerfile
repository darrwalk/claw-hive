FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ src/
COPY widget/ widget/
RUN npx tsc && npx tsx widget/build.ts

FROM node:22-alpine
WORKDIR /app
RUN addgroup -g 1001 -S voice && adduser -S voice -u 1001 -G voice
RUN apk add --no-cache curl

COPY --from=builder /app/dist/ dist/
COPY --from=builder /app/node_modules/ node_modules/
COPY --from=builder /app/package.json package.json
COPY static/ static/

USER voice
EXPOSE 8200
CMD ["node", "dist/server.js"]

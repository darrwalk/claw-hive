FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build Next.js app + compile custom server
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Custom server + voice modules (compiled from server.ts + src/voice/)
COPY --from=builder --chown=nextjs:nodejs /app/dist-server/server.js ./server.js
COPY --from=builder --chown=nextjs:nodejs /app/dist-server/src/voice ./src/voice
# Standalone trims node_modules — restore ws + full next for custom server
COPY --from=deps /app/node_modules/ws ./node_modules/ws
COPY --from=deps /app/node_modules/next ./node_modules/next
RUN apk add --no-cache curl docker-cli
USER nextjs
EXPOSE 3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]

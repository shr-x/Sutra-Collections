# ── Stage 1: Install dependencies ────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ── Stage 2: Build Next.js app ────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache git
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN git log -1 --format="%h %s" > .git-commit 2>/dev/null || echo "unknown" > .git-commit
RUN npm run build

# ── Stage 3: Production runtime ───────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Copy built app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json

# Copy node_modules (includes tsx for migration runner)
COPY --from=builder /app/node_modules ./node_modules

# Copy DB scripts and lib (needed at runtime for migrations)
COPY --from=builder /app/db ./db
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/types ./types
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/next.config.js ./next.config.js
COPY --from=builder /app/.git-commit ./.git-commit

# Entrypoint: run migrations, then start
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh

RUN mkdir -p /app/backups \
             /app/public/uploads \
             /app/public/uploads/designs \
             /app/public/uploads/items

EXPOSE 3000
CMD ["./entrypoint.sh"]

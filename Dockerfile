# NextBizStudio — production image (Next.js standalone)
FROM node:26-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund --ignore-scripts

FROM node:26-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:26-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S nextbiz && adduser -S nextbiz -G nextbiz
COPY --from=builder --chown=nextbiz:nextbiz /app/.next/standalone ./
COPY --from=builder --chown=nextbiz:nextbiz /app/.next/static ./.next/static
COPY --from=builder --chown=nextbiz:nextbiz /app/public ./public
USER nextbiz
EXPOSE 3000
CMD ["node", "server.js"]

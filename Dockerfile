# syntax=docker/dockerfile:1.6

FROM node:20-alpine AS runtime

# tini handles signals (Ctrl+C) and reaps zombies
RUN apk add --no-cache tini

# Non-root user
RUN addgroup -S sqlclone && adduser -S sqlclone -G sqlclone

WORKDIR /app

# Copy source with correct ownership
COPY --chown=sqlclone:sqlclone . .

# Writable data dir (used as volume mount point)
RUN mkdir -p /app/data && chown -R sqlclone:sqlclone /app/data

USER sqlclone

# TCP engine + Web UI
EXPOSE 5433 8080

# Health check against the web server
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/api/health >/dev/null 2>&1 || exit 1

ENV NODE_ENV=production
ENV PORT=5433
ENV WEB_PORT=8080
ENV HOST=0.0.0.0

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/index.js"]
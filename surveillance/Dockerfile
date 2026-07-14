FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json ./
COPY surveillance ./surveillance

USER node
EXPOSE 8090

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8090/api/health >/dev/null || exit 1

CMD ["node", "surveillance/server.js"]

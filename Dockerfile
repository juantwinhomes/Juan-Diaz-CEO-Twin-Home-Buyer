FROM node:24-alpine

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

COPY server ./server
COPY public ./public

ENV NODE_ENV=production
ENV PORT=4000
# DATABASE_URL, APP_PASSWORD and SESSION_SECRET are supplied by the host.
# Without DATABASE_URL the app falls back to an embedded database, which is
# fine locally but would be wiped on every redeploy in the cloud.

EXPOSE 4000
CMD ["node", "server/index.js"]

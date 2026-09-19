# The app has no npm dependencies, so there is nothing to install.
FROM node:24-alpine

WORKDIR /app
COPY package.json ./
COPY server ./server
COPY public ./public

ENV NODE_ENV=production
ENV PORT=4000
# Point the database at the mounted volume so it survives redeploys.
ENV KPI_DB_PATH=/data/kpi.db

EXPOSE 4000
CMD ["node", "server/index.js"]

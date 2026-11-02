FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/dashboard/package.json apps/dashboard/package.json
RUN npm ci
COPY apps/api apps/api
RUN npm run build:api
RUN mkdir -p /var/lib/traffic/evidence && chown -R node:node /var/lib/traffic
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 EVIDENCE_DIRECTORY=/var/lib/traffic/evidence
USER node
EXPOSE 3000
CMD ["npm", "run", "start:api"]

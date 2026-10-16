FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY frontend/package.json ./frontend/package.json
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S -g 1001 risklens && adduser -S -u 1001 -G risklens risklens
COPY --from=build --chown=risklens:risklens /app/frontend/.next/standalone ./
COPY --from=build --chown=risklens:risklens /app/frontend/.next/static ./frontend/.next/static
COPY --from=build --chown=risklens:risklens /app/frontend/public ./frontend/public
USER risklens
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3000').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "frontend/server.js"]

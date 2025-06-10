
FROM node:20 AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY index.html vite.config.ts tsconfig*.json ./
COPY src ./src
RUN npm run build

FROM caddy:2-builder AS xcaddy
RUN xcaddy build \
    --with github.com/mholt/caddy-ratelimit

FROM caddy:2
COPY --from=xcaddy /usr/bin/caddy /usr/bin/caddy
COPY --from=builder /app/dist /usr/share/caddy
COPY Caddyfile /etc/caddy/Caddyfile
EXPOSE 80
EXPOSE 443
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile"]
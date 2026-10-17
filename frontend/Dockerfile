FROM caddy:2-builder AS xcaddy
RUN xcaddy build \
    --with github.com/mholt/caddy-ratelimit

FROM caddy:2
COPY --from=xcaddy /usr/bin/caddy /usr/bin/caddy
COPY Caddyfile /etc/caddy/Caddyfile
EXPOSE 80
EXPOSE 443
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile"]


FROM debian:bookworm-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app
COPY ./pyproject.toml ./uv.lock ./
RUN uv sync --link-mode=copy
COPY ./app ./app
COPY ./migrations ./migrations
COPY ./entrypoint.sh ./manage.sh ./
EXPOSE 8080
CMD ["./entrypoint.sh"]
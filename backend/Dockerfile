
FROM debian:trixie-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /venv
COPY ./pyproject.toml ./uv.lock ./
RUN uv sync --link-mode=copy --no-dev
WORKDIR /app
COPY ./app ./app
COPY ./migrations ./migrations
COPY ./entrypoint.sh ./manage.sh pyproject.toml ./
COPY ./icon.svg ./
EXPOSE 8080
CMD ["./entrypoint.sh"]

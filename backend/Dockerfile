
FROM debian:trixie-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /venv
COPY ./pyproject.toml ./uv.lock .python-version ./
RUN uv sync --link-mode=copy
WORKDIR /app
COPY ./app ./app
COPY ./migrations ./migrations
COPY ./entrypoint.sh ./manage.sh pyproject.toml ./
EXPOSE 8080
CMD ["./entrypoint.sh"]
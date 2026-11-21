# NextCent API image. The build context is the REPOSITORY ROOT:
#   docker build -f services/api/Dockerfile -t nextcent-api .
#
# Base images are pinned to an exact minor/patch tag. Dependabot's `docker`
# ecosystem entry (.github/dependabot.yml, directory /services/api) opens weekly
# PRs that bump both FROM lines and the uv image tag below.

FROM python:3.15-slim-bookworm AS build
# Exact uv version (not `latest`) so builds are reproducible.
COPY --from=ghcr.io/astral-sh/uv:0.13.9 /uv /usr/local/bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
# Dependencies first (cached layer), then the project itself.
COPY services/api/pyproject.toml services/api/uv.lock ./
RUN uv sync --frozen --no-install-project --no-dev
COPY services/api/src ./src
COPY services/api/alembic.ini ./
COPY services/api/migrations ./migrations
RUN uv sync --frozen --no-dev

FROM python:3.15-slim-bookworm
RUN useradd --create-home --uid 10001 app
WORKDIR /app
COPY --from=build --chown=app:app /app /app
ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1 \
    # Which proxies uvicorn trusts for X-Forwarded-For (the in-app rate limiter keys on
    # the client IP it derives). 127.0.0.1 = trust nobody remote. Set this to your
    # platform proxy's address/CIDR; "*" ONLY when the container is reachable solely
    # through a trusted proxy that overwrites X-Forwarded-For. Read natively by uvicorn.
    FORWARDED_ALLOW_IPS=127.0.0.1
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2)"]
# --no-access-log: uvicorn's access log prints client IPs and full query strings (search terms).
# The app writes its own JSON access line instead (method, route template, status, duration, id).
CMD ["uvicorn", "nextcent_api.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--no-access-log"]

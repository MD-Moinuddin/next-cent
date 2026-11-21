# NextCent

NextCent is a personal finance tracker for quickly logging expenses and income and seeing where your money goes. It is a mobile-first Expo app (iOS, Android and web) backed by a FastAPI service and PostgreSQL, and it keeps working offline.

## Project structure

| Path                  | What it is                                                                          |
| --------------------- | ----------------------------------------------------------------------------------- |
| `apps/app`            | Expo + Expo Router app (mobile and web)                                             |
| `packages/shared`     | Money, dates and form schemas shared by the app                                     |
| `packages/api-client` | TypeScript client generated from the API's OpenAPI document                         |
| `services/api`        | FastAPI service, Alembic migrations, Dockerfile                                     |
| `contracts`           | Files shared by TypeScript and Python (currency table, money vectors, OpenAPI file) |
| `.github`             | CI workflows, Dependabot and the pull request template                              |

## Prerequisites

- **Node** `^22.13`, `^24.3` or `>=26`
- **pnpm 12** (pinned in `package.json`; install with `npm i -g pnpm` or `corepack enable`)
- **uv** (Python package manager, installs Python 3.12): <https://docs.astral.sh/uv/>
- **Docker** (local PostgreSQL)

## Getting started

```bash
# 1. Environment files (real .env files are git-ignored; .env.example documents every variable)
cp .env.example services/api/.env
cp apps/app/.env.example apps/app/.env

# 2. PostgreSQL (host port 5433)
docker compose up -d

# 3. Install dependencies
pnpm install
cd services/api && uv sync

# 4. Migrate the database and run the API (terminal 1, in services/api)
uv run alembic upgrade head
uv run uvicorn nextcent_api.main:create_app --factory --reload --no-access-log   # http://localhost:8000

# 5. Run the app (terminal 2, from the repository root)
pnpm --filter @nextcent/app exec expo start    # press w for web, i for iOS, a for Android
```

- `NEXTCENT_CORS_ORIGINS` must be a JSON list, for example `["http://localhost:8081"]`.
- Sign-in uses [Clerk](https://dashboard.clerk.com): put the publishable key in `apps/app/.env` and the issuer and JWKS URLs in `services/api/.env` (see `.env.example`). The test suites do not need Clerk.
- `alembic` takes the database URL from `NEXTCENT_DATABASE_URL` (environment, then `services/api/.env`) and prints which database it targets before migrating.
- The API test database `nextcent_test` is created by `docker/postgres/init.sql` on a fresh volume. On an existing volume run: `docker compose exec db psql -U nextcent -d postgres -c "CREATE DATABASE nextcent_test OWNER nextcent"`.
- Interactive API docs: <http://localhost:8000/docs>.

## Testing and checks

```bash
pnpm lint && pnpm typecheck && pnpm test      # all TypeScript packages
pnpm format:check                              # Prettier

cd services/api                                # needs `docker compose up -d`
uv run ruff check . && uv run ruff format --check .
uv run mypy src
uv run pytest -q

pnpm api:sync                                  # re-export contracts/openapi.json and regenerate the client
pnpm --filter @nextcent/app build:web          # production web bundle
pnpm --filter @nextcent/app exec playwright install chromium   # once
pnpm --filter @nextcent/app e2e                # Playwright + accessibility checks
```

- Run `pnpm api:sync` after every API change and commit the result. `contracts/openapi.json` and `packages/api-client/src/generated/` are generated; do not edit them by hand.
- The e2e build uses a test-only auth stub (`EXPO_PUBLIC_E2E_STUB_AUTH=1`, output `dist-e2e`). Never deploy `dist-e2e`, and build deployable web bundles only with `pnpm build:web`.

## Docker

```bash
docker build -f services/api/Dockerfile -t nextcent-api .     # build context is the repository root
```

The container reads the same `NEXTCENT_*` variables as the API (see `.env.example`).

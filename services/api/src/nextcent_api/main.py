from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from nextcent_api.auth import TokenVerifier, jwks_key_resolver
from nextcent_api.config import Settings, get_settings
from nextcent_api.errors import register_error_handlers
from nextcent_api.logging_config import configure_logging, scrub_sentry_event
from nextcent_api.middleware import (
    AccessLogMiddleware,
    BodySizeLimitMiddleware,
    RateLimitMiddleware,
    RequestIdMiddleware,
    SecurityHeadersMiddleware,
)
from nextcent_api.routers import (
    categories,
    export,
    health,
    internal,
    me,
    recurring,
    summary,
    tags,
    transactions,
)


def create_app(settings: Settings | None = None, verifier: TokenVerifier | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging()
    if settings.sentry_dsn:
        import sentry_sdk

        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            environment=settings.environment,
            send_default_pii=False,
            include_local_variables=False,
            max_request_body_size="never",
            traces_sample_rate=0.0,
            before_send=scrub_sentry_event,
        )
    # hide_parameters: DB errors (logs, Sentry) must never carry amounts, merchants or notes.
    engine = create_async_engine(settings.database_url, pool_pre_ping=True, hide_parameters=True)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        yield
        await engine.dispose()

    app = FastAPI(title="NextCent API", version="0.1.0", lifespan=lifespan)
    app.state.settings = settings
    app.state.engine = engine
    app.state.sessionmaker = async_sessionmaker(engine, expire_on_commit=False)
    app.state.verifier = verifier or TokenVerifier(
        jwks_key_resolver(settings.auth_jwks_url), settings.auth_issuer, settings.auth_audience
    )
    register_error_handlers(app)
    # Last added is outermost: CORS wraps everything so 413/429 responses carry CORS headers.
    app.add_middleware(BodySizeLimitMiddleware, max_bytes=settings.max_body_bytes)
    app.add_middleware(RateLimitMiddleware, rate_limit=settings.rate_limit)
    app.add_middleware(SecurityHeadersMiddleware)
    # Inside RequestId (so each line carries the id), outside the limits (so 413/429 are logged).
    app.add_middleware(AccessLogMiddleware)
    app.add_middleware(RequestIdMiddleware)
    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_methods=["GET", "PUT", "POST", "PATCH", "DELETE"],
            allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
            max_age=600,
        )
    app.include_router(health.router)
    app.include_router(me.router, prefix="/v1")
    app.include_router(categories.router, prefix="/v1")
    app.include_router(transactions.router, prefix="/v1")
    app.include_router(tags.router, prefix="/v1")
    app.include_router(recurring.router, prefix="/v1")
    app.include_router(summary.router, prefix="/v1")
    app.include_router(export.router, prefix="/v1")
    app.include_router(internal.router)
    return app

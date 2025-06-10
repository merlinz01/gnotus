import http.cookies
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.sessions import SessionMiddleware
from starlette.responses import Response
from starlette_csrf.middleware import CSRFMiddleware
from tortoise.contrib.fastapi import register_tortoise

from .api import router
from .settings import TORTOISE_ORM, settings


class CustomCSRFMiddleware(CSRFMiddleware):
    """
    Custom CSRF middleware to return a JSON response on CSRF validation failure.
    """

    def _get_error_response(self, request: Request) -> Response:
        cookie: http.cookies.BaseCookie = http.cookies.SimpleCookie()
        cookie_name = self.cookie_name
        cookie[cookie_name] = ""
        cookie[cookie_name]["max-age"] = 0
        cookie[cookie_name]["path"] = self.cookie_path
        cookie[cookie_name]["secure"] = self.cookie_secure
        cookie[cookie_name]["httponly"] = self.cookie_httponly
        cookie[cookie_name]["samesite"] = self.cookie_samesite
        if self.cookie_domain is not None:  # pragma: no cover
            cookie[cookie_name]["domain"] = self.cookie_domain
        return JSONResponse(
            {"detail": "CSRF token is missing or invalid"},
            status_code=403,
            headers={"Set-Cookie": cookie.output(header="").strip()},
        )


app = FastAPI(
    title="Gnotus",
    description="An open-source knowledge-base software",
    version="0.1.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.session_secret_key.get_secret_value(),
    session_cookie=settings.session_cookie,
    max_age=settings.session_max_age,
    same_site=settings.session_same_site,
    https_only=settings.session_https_only,
)
app.add_middleware(
    CustomCSRFMiddleware,
    secret=settings.csrf_secret_key.get_secret_value(),
    cookie_name="csrftoken",
    cookie_domain=settings.csrf_cookie_domain,
    cookie_samesite=settings.csrf_cookie_samesite,
    header_name="x-csrftoken",
    sensitive_cookies={settings.session_cookie},
)
app.include_router(router)
register_tortoise(app, TORTOISE_ORM, add_exception_handlers=False)
logging.getLogger("tortoise").setLevel(logging.WARNING)
logging.basicConfig(
    level=settings.log_level,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

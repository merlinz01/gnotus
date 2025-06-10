from typing import TYPE_CHECKING

from fastapi.testclient import TestClient as FastAPIClient

if TYPE_CHECKING:
    import app.models


class TestClient(FastAPIClient):
    def request(self, *args, **kwargs):
        resp = super().request(*args, **kwargs)
        self.cookies.extract_cookies(resp)
        return resp

    def set_session_user(
        self,
        user: "app.models.User | None" = None,
    ) -> None:
        """
        Set the session user for the client.
        If no user is provided, the session will be cleared.
        """
        import json
        from base64 import b64encode

        from starlette.middleware.sessions import SessionMiddleware

        session_middleware = None
        middleware = self.app.middleware_stack  # type: ignore
        while middleware:
            if isinstance(middleware, SessionMiddleware):
                session_middleware = middleware
                break
            middleware = middleware.app
        if session_middleware is None:
            raise RuntimeError("SessionMiddleware not found in the middleware stack.")

        if user is None:
            self.cookies.delete(session_middleware.session_cookie)
        else:
            session = {
                "user_id": user.id,
            }
            self.cookies.set(
                name=session_middleware.session_cookie,
                value=session_middleware.signer.sign(
                    b64encode(json.dumps(session).encode("utf-8"))
                ).decode("utf-8"),
                path=session_middleware.path,
            )

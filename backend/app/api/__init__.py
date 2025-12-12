from fastapi import APIRouter

from .auth import router as auth_router
from .config import router as config_router
from .docs import router as docs_router
from .sharelinks import router as sharelinks_router
from .sitemap import router as sitemap_router
from .uploads import router as uploads_router
from .users import router as users_router

router = APIRouter(prefix="/api", tags=["api"])
router.include_router(auth_router)
router.include_router(users_router)
router.include_router(docs_router)
router.include_router(sharelinks_router)
router.include_router(config_router)
router.include_router(sitemap_router)
router.include_router(uploads_router)

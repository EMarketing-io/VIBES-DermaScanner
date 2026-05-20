from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from config import CORS_ORIGINS, OPENAI_API_KEY, UPLOAD_FOLDER
from routers.analysis import router as analysis_router
from routers.chat import router as chat_router
from routers.leads import router as leads_router


def create_app() -> FastAPI:
    app = FastAPI(title="Vibes DermaScan API")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.mount("/uploads", StaticFiles(directory=UPLOAD_FOLDER), name="uploads")

    @app.get("/api/health")
    def health():
        return {"status": "ok", "openai": bool(OPENAI_API_KEY)}

    app.include_router(analysis_router)
    app.include_router(leads_router)
    app.include_router(chat_router)
    return app


app = create_app()

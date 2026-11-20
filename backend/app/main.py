import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app import models  # noqa: F401 — регистрирует модели в metadata
from app.db import Base, engine
from app.routers import assessments, assignments, attempts, auth, courses, files, imports, library, reports, scenarios, sync, tests, users

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

@asynccontextmanager
async def lifespan(_app):
    Base.metadata.create_all(engine)
    yield


app = FastAPI(title="Dolce Pharm LMS API", version="1.0", docs_url="/api/docs", openapi_url="/api/openapi.json",
              redoc_url=None, lifespan=lifespan)


@app.exception_handler(RequestValidationError)
async def validation_handler(_, exc: RequestValidationError):
    first = exc.errors()[0] if exc.errors() else {}
    loc = ".".join(str(x) for x in first.get("loc", []) if x != "body")
    return JSONResponse(status_code=422, content={"detail": {"code": "validation_error",
                                                             "message": f"{loc}: {first.get('msg', 'ошибка')}"}})


@app.get("/api/health")
def health():
    return {"ok": True}


for r in (auth, users, imports, files, courses, tests, assignments, attempts, library, sync, reports, assessments, scenarios):
    app.include_router(r.router, prefix="/api")

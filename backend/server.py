import os
import logging

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from db import db, client
from auth import auth_router
from deals import deals_router
from research import research_router
from seed import run_seed

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("lenden_prohori")

app = FastAPI(title="Lenden Prohori API")


@app.get("/api/")
async def root():
    return {"app": "Lenden Prohori", "status": "ok", "phase": 1}


@app.get("/api/health")
async def health():
    return {"status": "healthy"}


app.include_router(auth_router)
app.include_router(deals_router)
app.include_router(research_router)

_frontend = os.environ.get("FRONTEND_URL", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[_frontend, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    try:
        await db.users.create_index("email", unique=True)
        await db.users.create_index("user_id", unique=True)
        await db.user_sessions.create_index("session_token")
        await db.deals.create_index("deal_id", unique=True)
        await db.subjects.create_index("subject_id", unique=True)
        await db.reports.create_index("report_id", unique=True)
        await run_seed()
        logger.info("Startup seeding complete")
    except Exception as e:
        logger.exception("Startup seeding failed: %s", e)


@app.on_event("shutdown")
async def on_shutdown():
    client.close()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.auth import router as auth_router
from app.api.routes.invites import router as invites_router
from app.api.routes.rooms import router as rooms_router
from app.api.routes.users import router as users_router
from app.api.routes.ws import router as ws_router
from app.core.config import settings

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(rooms_router)
app.include_router(users_router)
app.include_router(invites_router)
app.include_router(ws_router)


@app.get("/")
async def read_root():
    return {"Hello": "World"}

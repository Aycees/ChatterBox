from fastapi import FastAPI

from app.api.routes.auth import router as auth_router

app = FastAPI()

app.include_router(auth_router)


@app.get("/")
async def read_root():
    return {"Hello": "World"}
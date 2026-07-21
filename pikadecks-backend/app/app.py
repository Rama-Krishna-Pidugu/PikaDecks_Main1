from fastapi import FastAPI

from fastapi.middleware.cors import (
    CORSMiddleware,
)

from app.routes.user import (
    router as user_router,
)

from app.routes.protected import (
    router as protected_router,
)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(user_router)
app.include_router(protected_router)


@app.get("/")
def root():
    return {
        "success": True,
        "message": "PikaDecks Backend is Running",
    }
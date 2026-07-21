from fastapi import APIRouter, Depends

from app.services.get_current_user import get_current_user

router = APIRouter()


@router.get("/protected")
def protected_route(current_user: dict = Depends(get_current_user)):
    return {
        "success": True,
        "message": "Protected route working",
        "user": current_user,
    }

import base64
import secrets

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Device, User
from app.schemas import DeviceIn, LoginIn
from app.security import api_error, create_token, get_current_user, verify_password
from app.serializers import user_out

router = APIRouter(tags=["auth"])


@router.post("/auth/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.login == body.login.strip().lower()))
    if not user or not user.is_active or not verify_password(body.password, user.password_hash):
        raise api_error(401, "bad_credentials", "Неверный логин или пароль")
    token, exp = create_token(user)
    return {"access_token": token, "token_type": "bearer", "expires_at": exp.isoformat(), "user": user_out(user)}


@router.get("/auth/me")
def me(user: User = Depends(get_current_user)):
    return user_out(user)


@router.post("/devices")
def register_device(body: DeviceIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    secret = secrets.token_bytes(32)
    d = Device(user_id=user.id, name=body.name[:200] or "Устройство", secret=secret)
    db.add(d)
    db.commit()
    return {"device_id": str(d.id), "secret_b64": base64.b64encode(secret).decode()}

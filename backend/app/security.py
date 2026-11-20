import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models import User

bearer = HTTPBearer(auto_error=False)


def api_error(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message})


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=10)).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


def create_token(user: User) -> tuple[str, datetime]:
    exp = datetime.now(timezone.utc) + timedelta(days=settings.JWT_TTL_DAYS)
    token = jwt.encode({"sub": str(user.id), "role": user.role, "exp": exp}, settings.JWT_SECRET, algorithm="HS256")
    return token, exp


def get_current_user(
    cred: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)
) -> User:
    if not cred:
        raise api_error(401, "unauthorized", "Требуется вход")
    try:
        data = jwt.decode(cred.credentials, settings.JWT_SECRET, algorithms=["HS256"])
        user = db.get(User, uuid.UUID(data["sub"]))
    except (jwt.PyJWTError, KeyError, ValueError):
        raise api_error(401, "unauthorized", "Недействительный токен")
    if not user or not user.is_active:
        raise api_error(401, "unauthorized", "Пользователь не найден или отключён")
    return user


def require_role(*roles: str):
    def dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise api_error(403, "forbidden", "Недостаточно прав")
        return user

    return dep


STAFF = ("admin", "methodist")
STAFF_MANAGER = ("admin", "methodist", "manager")

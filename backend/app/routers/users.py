import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Department, User
from app.schemas import NameIn, UserIn, UserPatch
from app.security import STAFF, api_error, get_current_user, hash_password, require_role
from app.serializers import user_out

router = APIRouter(tags=["users"])


@router.get("/users")
def list_users(department_id: uuid.UUID | None = None, role: str | None = None, q: str | None = None,
               user: User = Depends(require_role("admin", "methodist", "manager")), db: Session = Depends(get_db)):
    stmt = select(User)
    if user.role == "manager":
        stmt = stmt.where(User.department_id == user.department_id)
    if department_id:
        stmt = stmt.where(User.department_id == department_id)
    if role:
        stmt = stmt.where(User.role == role)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(or_(User.full_name.ilike(like), User.login.ilike(like)))
    return [user_out(u) for u in db.scalars(stmt.order_by(User.full_name)).unique()]


def _check_login(db: Session, login: str, exclude: uuid.UUID | None = None):
    existing = db.scalar(select(User).where(User.login == login))
    if existing and existing.id != exclude:
        raise api_error(409, "login_taken", "Логин уже занят")


@router.post("/users")
def create_user(body: UserIn, _: User = Depends(require_role(*STAFF)), db: Session = Depends(get_db)):
    login = body.login.strip().lower()
    _check_login(db, login)
    if not body.password:
        raise api_error(422, "password_required", "Укажите пароль")
    u = User(full_name=body.full_name, login=login, password_hash=hash_password(body.password), role=body.role,
             position=body.position, department_id=body.department_id, manager_id=body.manager_id, lang=body.lang,
             is_active=body.is_active)
    db.add(u)
    db.commit()
    db.refresh(u)
    return user_out(u)


@router.patch("/users/{user_id}")
def patch_user(user_id: uuid.UUID, body: UserPatch, _: User = Depends(require_role(*STAFF)), db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if not u:
        raise api_error(404, "not_found", "Пользователь не найден")
    data = body.model_dump(exclude_unset=True)
    if data.pop("password", None):
        u.password_hash = hash_password(body.password)
    for k, v in data.items():
        setattr(u, k, v)
    db.commit()
    db.refresh(u)
    return user_out(u)


@router.delete("/users/{user_id}")
def delete_user(user_id: uuid.UUID, me: User = Depends(require_role(*STAFF)), db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if not u:
        raise api_error(404, "not_found", "Пользователь не найден")
    if u.id == me.id:
        raise api_error(400, "self_delete", "Нельзя удалить себя")
    u.is_active = False  # мягкое удаление: история обучения сохраняется
    db.commit()
    return {"ok": True}


@router.get("/departments")
def list_departments(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [{"id": str(d.id), "name": d.name} for d in db.scalars(select(Department).order_by(Department.name))]


@router.post("/departments")
def create_department(body: NameIn, _: User = Depends(require_role(*STAFF)), db: Session = Depends(get_db)):
    d = Department(name=body.name.strip())
    db.add(d)
    db.commit()
    return {"id": str(d.id), "name": d.name}

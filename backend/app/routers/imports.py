"""Импорт пользователей из CSV/XLSX и экспорт списка (раздел 7.9)."""
import csv
import io

from fastapi import APIRouter, Depends, File, Query, UploadFile
from openpyxl import load_workbook
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import ROLES, Department, User
from app.security import STAFF, api_error, hash_password, require_role
from app.services.export import table_response

router = APIRouter(tags=["imports"])
COLUMNS = ["full_name", "login", "password", "role", "position", "department"]
ROLE_ALIASES = {"администратор": "admin", "методист": "methodist", "руководитель": "manager", "сотрудник": "employee"}


def _read_rows(name: str, content: bytes) -> list[dict]:
    if name.lower().endswith((".xlsx", ".xlsm")):
        wb = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        ws = wb.active
        it = ws.iter_rows(values_only=True)
        header = [str(h or "").strip().lower() for h in next(it, [])]
        return [{header[i]: ("" if v is None else str(v).strip()) for i, v in enumerate(r) if i < len(header)} for r in it]
    text = content.decode("utf-8-sig", errors="replace")
    sample = text[:2000]
    delim = ";" if sample.count(";") >= sample.count(",") else ","
    reader = csv.DictReader(io.StringIO(text), delimiter=delim)
    return [{(k or "").strip().lower(): (v or "").strip() for k, v in r.items()} for r in reader]


@router.post("/imports/users")
async def import_users(file: UploadFile = File(...), dry_run: bool = Query(False),
                       _: User = Depends(require_role(*STAFF)), db: Session = Depends(get_db)):
    content = await file.read()
    try:
        rows = _read_rows(file.filename or "", content)
    except Exception:  # noqa: BLE001
        raise api_error(400, "bad_file", "Не удалось прочитать файл. Нужен CSV или XLSX")
    depts = {d.name.lower(): d for d in db.scalars(select(Department))}
    created, updated, errors, preview = 0, 0, [], []
    seen = set()
    for n, r in enumerate(rows, start=2):  # строка 1 — заголовок
        if not any(r.values()):
            continue
        full_name, login = r.get("full_name", ""), r.get("login", "").lower()
        role = ROLE_ALIASES.get(r.get("role", "").lower(), r.get("role", "").lower() or "employee")
        if not full_name or not login:
            errors.append({"row": n, "message": "Пустые full_name или login"})
            continue
        if role not in ROLES:
            errors.append({"row": n, "message": f"Неизвестная роль «{r.get('role')}»"})
            continue
        if login in seen:
            errors.append({"row": n, "message": f"Логин «{login}» повторяется в файле"})
            continue
        seen.add(login)
        dept = None
        dname = r.get("department", "")
        if dname:
            dept = depts.get(dname.lower())
            if not dept and not dry_run:
                dept = Department(name=dname)
                db.add(dept)
                db.flush()
                depts[dname.lower()] = dept
        existing = db.scalar(select(User).where(User.login == login))
        action = "update" if existing else "create"
        if not existing and not r.get("password"):
            errors.append({"row": n, "message": "Для нового пользователя нужен пароль"})
            continue
        preview.append({"row": n, "action": action, "full_name": full_name, "login": login, "role": role,
                        "position": r.get("position", ""), "department": dname})
        if dry_run:
            continue
        if existing:
            existing.full_name, existing.role, existing.position = full_name, role, r.get("position") or existing.position
            existing.department_id = dept.id if dept else existing.department_id
            if r.get("password"):
                existing.password_hash = hash_password(r["password"])
            updated += 1
        else:
            db.add(User(full_name=full_name, login=login, password_hash=hash_password(r["password"]), role=role,
                        position=r.get("position") or None, department_id=dept.id if dept else None))
            created += 1
    if not dry_run:
        db.commit()
    else:
        created = sum(p["action"] == "create" for p in preview)
        updated = sum(p["action"] == "update" for p in preview)
    return {"created": created, "updated": updated, "errors": errors, "preview": preview, "dry_run": dry_run}


@router.get("/exports/users")
def export_users(format: str = "xlsx", _: User = Depends(require_role(*STAFF)), db: Session = Depends(get_db)):
    cols = [{"key": "full_name", "title": "full_name"}, {"key": "login", "title": "login"}, {"key": "role", "title": "role"},
            {"key": "position", "title": "position"}, {"key": "department", "title": "department"},
            {"key": "is_active", "title": "is_active"}]
    rows = [{"full_name": u.full_name, "login": u.login, "role": u.role, "position": u.position or "",
             "department": u.department.name if u.department else "", "is_active": "1" if u.is_active else "0"}
            for u in db.scalars(select(User).order_by(User.full_name)).unique()]
    return table_response(format, "users", cols, rows)

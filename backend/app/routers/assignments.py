import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Course, CourseAssignment, User
from app.schemas import AssignmentIn
from app.security import STAFF, STAFF_MANAGER, api_error, get_current_user, require_role
from app.services.reports import assignment_states

router = APIRouter(tags=["assignments"])

RETRAIN_DAYS = 14  # срок повторного обучения по умолчанию


def assignment_out(a: CourseAssignment, course: Course | None = None, user: User | None = None) -> dict:
    d = {"id": str(a.id), "course_id": str(a.course_id), "user_id": str(a.user_id),
         "due_date": a.due_date.isoformat() if a.due_date else None, "created_at": a.created_at.isoformat() if a.created_at else None}
    if course:
        d.update(course_title=course.title, course_version=course.version, course_status=course.status,
                 cover_color=course.cover_color, description=course.description)
    if user:
        d.update(full_name=user.full_name, department_name=user.department.name if user.department else None)
    return d


@router.post("/assignments")
def create_assignments(body: AssignmentIn, me: User = Depends(require_role(*STAFF_MANAGER)), db: Session = Depends(get_db)):
    if not db.get(Course, body.course_id):
        raise api_error(404, "not_found", "Курс не найден")
    q = select(User).where(User.is_active.is_(True))
    if body.user_ids:
        q = q.where(User.id.in_(body.user_ids))
    elif body.department_id:
        q = q.where(User.department_id == body.department_id)
    else:
        raise api_error(422, "no_target", "Выберите сотрудников или подразделение")
    users = list(db.scalars(q).unique())
    if not users:
        raise api_error(404, "no_users", "Сотрудники не найдены")
    if me.role == "manager" and any(u.department_id != me.department_id for u in users):
        raise api_error(403, "forbidden", "Руководитель назначает только в своём подразделении")
    existing = {a.user_id: a for a in db.scalars(select(CourseAssignment).where(
        CourseAssignment.course_id == body.course_id, CourseAssignment.user_id.in_([u.id for u in users])))}
    results = []
    for u in users:
        a = existing.get(u.id)
        if a is None:
            # ON CONFLICT DO NOTHING — на случай двойного клика/параллельного запроса
            res = db.execute(pg_insert(CourseAssignment).values(
                id=uuid.uuid4(), course_id=body.course_id, user_id=u.id, assigned_by=me.id, due_date=body.due_date,
            ).on_conflict_do_nothing(index_elements=["course_id", "user_id"]).returning(CourseAssignment.id))
            results.append((u, "assigned" if res.scalar() else "already_assigned"))
        elif body.retrain:
            # повторное обучение: новый срок, статус с нуля; старые попытки остаются в истории
            a.reset_at = datetime.now(timezone.utc)
            a.due_date = body.due_date or (date.today() + timedelta(days=RETRAIN_DAYS))
            a.assigned_by = me.id
            results.append((u, "retrained"))
        else:
            # уже назначен: ничего не меняем (раньше срок молча затирался на пустой); срок обновляем, только если его передали
            if body.due_date:
                a.due_date = body.due_date
            results.append((u, "already_assigned"))
    db.commit()
    out = []
    for u, outcome in results:
        st = assignment_states(db, u).get(str(body.course_id), {})
        out.append({"user_id": str(u.id), "full_name": u.full_name, "outcome": outcome,
                    "status": st.get("status"), "status_ru": st.get("status_ru"),
                    "due_date": st.get("due_date_iso"), "overdue": st.get("overdue", False)})
    first = out[0]
    return {
        "assigned": sum(1 for r in out if r["outcome"] == "assigned"),
        "already_assigned": any(r["outcome"] == "already_assigned" for r in out),
        "already_assigned_count": sum(1 for r in out if r["outcome"] == "already_assigned"),
        "retrained": sum(1 for r in out if r["outcome"] == "retrained"),
        # для одного сотрудника (кнопка «Назначить» в профиле 360) — его итог и статус сразу на верхнем уровне
        **({k: first[k] for k in ("outcome", "full_name", "status", "status_ru", "due_date", "overdue")} if len(out) == 1 else {}),
        "results": out,
    }


@router.get("/assignments")
def list_assignments(course_id: uuid.UUID | None = None, me: User = Depends(require_role(*STAFF_MANAGER)), db: Session = Depends(get_db)):
    q = select(CourseAssignment, User).join(User, User.id == CourseAssignment.user_id)
    if course_id:
        q = q.where(CourseAssignment.course_id == course_id)
    if me.role == "manager":
        q = q.where(User.department_id == me.department_id)
    courses = {c.id: c for c in db.scalars(select(Course))}
    return [assignment_out(a, courses.get(a.course_id), u) for a, u in db.execute(q).unique()]


@router.delete("/assignments/{assignment_id}")
def delete_assignment(assignment_id: uuid.UUID, me: User = Depends(require_role(*STAFF_MANAGER)), db: Session = Depends(get_db)):
    a = db.get(CourseAssignment, assignment_id)
    if a:
        if me.role == "manager" and db.get(User, a.user_id).department_id != me.department_id:
            raise api_error(403, "forbidden", "Чужое подразделение")
        db.delete(a)
        db.commit()
    return {"ok": True}


@router.get("/assignments/my")
def my_assignments(me: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(select(CourseAssignment, Course).join(Course, Course.id == CourseAssignment.course_id).where(
        CourseAssignment.user_id == me.id, Course.status == "published"))
    return [assignment_out(a, c) for a, c in rows]


_ = STAFF

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import delete, func, insert, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Course, CourseAssignment, CourseMaterial, File, Test, User, course_competencies
from app.schemas import CourseIn, CoursePatch, MaterialIn, MaterialPatch, ReorderIn
from app.security import STAFF, api_error, get_current_user, require_role
from app.serializers import course_out, material_out
from app.services.package import build_package, new_salt

router = APIRouter(tags=["courses"])


def get_course(db: Session, course_id: uuid.UUID) -> Course:
    c = db.get(Course, course_id)
    if not c:
        raise api_error(404, "not_found", "Курс не найден")
    return c


def is_assigned(db: Session, user: User, course_id: uuid.UUID) -> bool:
    return db.scalar(select(CourseAssignment.id).where(CourseAssignment.user_id == user.id, CourseAssignment.course_id == course_id)) is not None


def _set_competencies(db: Session, course_id, ids):
    db.execute(delete(course_competencies).where(course_competencies.c.course_id == course_id))
    for cid in set(ids):
        db.execute(insert(course_competencies).values(course_id=course_id, competency_id=cid))


@router.get("/courses")
def list_courses(category_id: uuid.UUID | None = None, status: str | None = None,
                 user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = select(Course)
    if user.role in STAFF:
        if status:
            q = q.where(Course.status == status)
    elif user.role == "manager":
        q = q.where(Course.status == "published")
    else:
        q = q.join(CourseAssignment, CourseAssignment.course_id == Course.id).where(
            CourseAssignment.user_id == user.id, Course.status == "published")
    if category_id:
        q = q.where(Course.category_id == category_id)
    courses = list(db.scalars(q.order_by(Course.created_at.desc())).unique())
    tests = {t.course_id: t for t in db.scalars(select(Test))}
    out = []
    for c in courses:
        d = course_out(db, c)
        t = tests.get(c.id)
        d["questions_count"] = len(t.questions) if t else 0
        d["assigned_count"] = db.scalar(select(func.count()).select_from(CourseAssignment).where(CourseAssignment.course_id == c.id))
        out.append(d)
    return out


@router.post("/courses")
def create_course(body: CourseIn, user: User = Depends(require_role(*STAFF)), db: Session = Depends(get_db)):
    c = Course(title=body.title, description=body.description, category_id=body.category_id, pass_score=body.pass_score,
               cover_color=body.cover_color, author_id=user.id, status="draft", version=1)
    db.add(c)
    db.flush()
    _set_competencies(db, c.id, body.competency_ids)
    db.commit()
    return course_out(db, c, full=True)


@router.get("/courses/{course_id}")
def read_course(course_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = get_course(db, course_id)
    if user.role == "employee" and not is_assigned(db, user, c.id):
        raise api_error(403, "forbidden", "Курс не назначен")
    return course_out(db, c, full=True)


@router.patch("/courses/{course_id}")
def patch_course(course_id: uuid.UUID, body: CoursePatch, _: User = Depends(require_role(*STAFF)), db: Session = Depends(get_db)):
    c = get_course(db, course_id)
    data = body.model_dump(exclude_unset=True)
    comps = data.pop("competency_ids", None)
    for k, v in data.items():
        setattr(c, k, v)
    if comps is not None:
        _set_competencies(db, c.id, comps)
    db.commit()
    return course_out(db, c, full=True)


@router.delete("/courses/{course_id}")
def delete_course(course_id: uuid.UUID, _: User = Depends(require_role(*STAFF)), db: Session = Depends(get_db)):
    db.delete(get_course(db, course_id))
    db.commit()
    return {"ok": True}


@router.post("/courses/{course_id}/publish")
def publish(course_id: uuid.UUID, _: User = Depends(require_role(*STAFF)), db: Session = Depends(get_db)):
    c = get_course(db, course_id)
    if c.status == "published":
        c.version += 1
    c.status = "published"
    t = db.scalar(select(Test).where(Test.course_id == c.id))
    if t:
        t.salt = new_salt()
    db.commit()
    return course_out(db, c, full=True)


@router.post("/courses/{course_id}/unpublish")
def unpublish(course_id: uuid.UUID, _: User = Depends(require_role(*STAFF)), db: Session = Depends(get_db)):
    c = get_course(db, course_id)
    c.status = "draft"
    db.commit()
    return course_out(db, c, full=True)


@router.get("/courses/{course_id}/package")
def package(course_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = get_course(db, course_id)
    if user.role not in STAFF:
        if c.status != "published":
            raise api_error(403, "not_published", "Курс не опубликован")
        if not is_assigned(db, user, c.id):
            raise api_error(403, "forbidden", "Курс не назначен")
    return build_package(db, c)


# ---------------------------------------------------------------- материалы
@router.post("/courses/{course_id}/materials")
def add_material(course_id: uuid.UUID, body: MaterialIn, _: User = Depends(require_role(*STAFF)), db: Session = Depends(get_db)):
    c = get_course(db, course_id)
    if body.type == "link" and not body.url:
        raise api_error(422, "url_required", "Укажите адрес ссылки")
    if body.type not in ("link", "text"):
        if not body.file_id or not db.get(File, body.file_id):
            raise api_error(422, "file_required", "Загрузите файл")
    pos = (max((m.position for m in c.materials), default=0)) + 1
    m = CourseMaterial(course_id=c.id, position=pos, **body.model_dump())
    db.add(m)
    db.commit()
    db.refresh(m)
    return material_out(m)


@router.patch("/materials/{material_id}")
def patch_material(material_id: uuid.UUID, body: MaterialPatch, _: User = Depends(require_role(*STAFF)), db: Session = Depends(get_db)):
    m = db.get(CourseMaterial, material_id)
    if not m:
        raise api_error(404, "not_found", "Материал не найден")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(m, k, v)
    db.commit()
    db.refresh(m)
    return material_out(m)


@router.delete("/materials/{material_id}")
def delete_material(material_id: uuid.UUID, _: User = Depends(require_role(*STAFF)), db: Session = Depends(get_db)):
    m = db.get(CourseMaterial, material_id)
    if m:
        db.delete(m)
        db.commit()
    return {"ok": True}


@router.post("/courses/{course_id}/materials/reorder")
def reorder(course_id: uuid.UUID, body: ReorderIn, _: User = Depends(require_role(*STAFF)), db: Session = Depends(get_db)):
    c = get_course(db, course_id)
    by_id = {m.id: m for m in c.materials}
    for i, mid in enumerate(body.ids, start=1):
        if mid in by_id:
            by_id[mid].position = i
    db.commit()
    db.refresh(c)
    return [material_out(m) for m in sorted(c.materials, key=lambda m: m.position)]

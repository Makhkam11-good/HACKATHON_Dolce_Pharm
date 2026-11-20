from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Course, CourseMaterial, File, LibraryItem, User, course_competencies


def iso(d):
    return d.isoformat() if d else None


def user_out(u: User) -> dict:
    return {
        "id": str(u.id), "full_name": u.full_name, "login": u.login, "role": u.role, "position": u.position,
        "department_id": str(u.department_id) if u.department_id else None,
        "department_name": u.department.name if u.department else None,
        "manager_id": str(u.manager_id) if u.manager_id else None, "lang": u.lang, "is_active": u.is_active,
    }


def file_out(f: File | None) -> dict | None:
    if not f:
        return None
    return {
        "id": str(f.id), "original_name": f.original_name, "mime": f.mime, "size_bytes": f.size_bytes,
        "offline_mime": f.offline_mime, "offline_size_bytes": f.offline_size_bytes, "sha256": f.sha256,
        "conversion_status": f.conversion_status, "conversion_error": f.conversion_error,
    }


def material_out(m: CourseMaterial) -> dict:
    return {
        "id": str(m.id), "course_id": str(m.course_id), "position": m.position, "type": m.type, "title": m.title,
        "file_id": str(m.file_id) if m.file_id else None, "file": file_out(m.file), "url": m.url,
        "body_md": m.body_md, "min_seconds": m.min_seconds,
    }


def course_competency_ids(db: Session, course_id) -> list[str]:
    return [str(x) for x in db.scalars(select(course_competencies.c.competency_id).where(course_competencies.c.course_id == course_id))]


def course_out(db: Session, c: Course, full: bool = False) -> dict:
    d = {
        "id": str(c.id), "title": c.title, "description": c.description,
        "category_id": str(c.category_id) if c.category_id else None, "status": c.status, "version": c.version,
        "pass_score": c.pass_score, "cover_color": c.cover_color, "author_id": str(c.author_id) if c.author_id else None,
        "materials_count": len(c.materials), "created_at": iso(c.created_at),
    }
    if full:
        d["materials"] = [material_out(m) for m in c.materials]
        d["competency_ids"] = course_competency_ids(db, c.id)
    return d


def library_out(i: LibraryItem) -> dict:
    return {
        "id": str(i.id), "title": i.title, "description": i.description,
        "category_id": str(i.category_id) if i.category_id else None, "file_id": str(i.file_id) if i.file_id else None,
        "file": file_out(i.file), "tags": list(i.tags or []), "allow_offline": i.allow_offline, "created_at": iso(i.created_at),
    }

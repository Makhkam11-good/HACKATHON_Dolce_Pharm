import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Certificate, Course, Department, User
from app.security import STAFF, api_error, get_current_user, require_role
from app.services.certificate_pdf import certificate_pdf, protocol_pdf
from app.services.export import file_response, table_response
from app.services.reports import REPORTS, Filters, attestation_data, fmt_dt

router = APIRouter(tags=["reports"])


def filters(date_from: date | None = Query(None, alias="from"), date_to: date | None = Query(None, alias="to"),
            department_id: uuid.UUID | None = None, user_id: uuid.UUID | None = None,
            course_id: uuid.UUID | None = None) -> Filters:
    return Filters(date_from, date_to, department_id, user_id, course_id)


def _run(name: str, me: User, f: Filters, db: Session) -> dict:
    if name not in REPORTS:
        raise api_error(404, "unknown_report", "Нет такого отчёта")
    return REPORTS[name][1](db, me, f)


@router.get("/reports/attestation-data")
def attestation_raw(f: Filters = Depends(filters), me: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return attestation_data(db, me, f)


@router.get("/reports/{name}")
def report(name: str, f: Filters = Depends(filters), me: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _run(name, me, f, db)


@router.get("/reports/{name}/export")
def report_export(name: str, format: str = "xlsx", f: Filters = Depends(filters), me: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    data = _run(name, me, f, db)
    return table_response(format, f"report-{name}", data["columns"], data["rows"])


# ---------------------------------------------------------------- сертификаты
@router.get("/certificates/{cert_id}/pdf")
def cert_pdf(cert_id: uuid.UUID, me: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = db.get(Certificate, cert_id)
    if not c:
        raise api_error(404, "not_found", "Сертификат не найден")
    if c.user_id != me.id and me.role not in (*STAFF, "manager"):
        raise api_error(403, "forbidden", "Нет доступа")
    return file_response(certificate_pdf(db, c), f"certificate-{c.number}.pdf", "application/pdf")


@router.get("/certificates/verify/{code}")
def verify(code: str, db: Session = Depends(get_db)):
    c = db.scalar(select(Certificate).where(Certificate.verify_code == code.strip().upper()))
    if not c:
        return {"valid": False}
    u = db.get(User, c.user_id)
    course = db.get(Course, c.course_id)
    return {"valid": True, "full_name": u.full_name, "position": u.position, "course": course.title if course else "",
            "issued_at": c.issued_at.isoformat(), "issued_at_local": fmt_dt(c.issued_at), "number": c.number}


@router.get("/protocols/attestation")
def protocol(course_id: uuid.UUID, department_id: uuid.UUID | None = None, format: str = "pdf",
             me: User = Depends(require_role(*STAFF, "manager")), db: Session = Depends(get_db)):
    course = db.get(Course, course_id)
    if not course:
        raise api_error(404, "not_found", "Курс не найден")
    rows = attestation_data(db, me, Filters(department_id=department_id, course_id=course_id))
    dept = db.get(Department, department_id).name if department_id else "все подразделения"
    table = [[r["full_name"], r["position"], r["date"][:10], f"{r['best_score']:.1f}" if r["best_score"] is not None else "—",
              r["status_ru"]] for r in rows]
    if format != "pdf":
        cols = [{"key": str(i), "title": t} for i, t in enumerate(["ФИО", "Должность", "Дата", "Балл", "Результат"])]
        return table_response(format, "protocol", cols, [{str(i): v for i, v in enumerate(r)} for r in table])
    return Response(protocol_pdf("Протокол аттестации", course.title, dept, table), media_type="application/pdf",
                    headers={"Content-Disposition": 'attachment; filename="protocol.pdf"'})

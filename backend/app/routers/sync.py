from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import (
    Assessment,
    AssessmentRater,
    Certificate,
    Course,
    CourseAssignment,
    Device,
    SyncLog,
    Test,
    TestAttempt,
    User,
)
from app.routers.attempts import attempt_out
from app.schemas import QrIn, SyncIn
from app.security import STAFF_MANAGER, api_error, get_current_user, require_role
from app.services.qr_service import receive_qr
from app.services.sync_service import Reject, parse_dt, process_items

router = APIRouter(tags=["sync"])


@router.post("/sync")
def sync(body: SyncIn, me: User = Depends(get_current_user), db: Session = Depends(get_db)):
    device = db.get(Device, body.device_id)
    if not device or device.user_id != me.id:
        raise api_error(403, "foreign_device", "Устройство не принадлежит пользователю")
    server_now = datetime.now(timezone.utc)
    try:
        client_now = parse_dt(body.client_now)
    except Reject:
        raise api_error(422, "bad_client_now", "Неверное время клиента")
    offset = int((server_now - client_now).total_seconds() * 1000)
    device.clock_offset_ms = offset
    device.offset_known = True
    res = process_items(db, me, device, [i.model_dump() for i in body.items], "sync", offset)
    online_since = None
    lag = None
    if body.online_since:
        try:
            os_ = parse_dt(body.online_since)
            online_since = os_ and os_.astimezone(timezone.utc)
            if online_since:
                online_since = online_since + timedelta(milliseconds=offset)
                lag = max(0, int((server_now - online_since).total_seconds() * 1000))
        except Reject:
            pass
    if body.items:
        db.add(SyncLog(device_id=device.id, user_id=me.id, source="sync", items_count=len(body.items),
                       accepted_count=len(res["accepted"]), duplicates_count=len(res["duplicates"]),
                       rejected_count=len(res["rejected"]), received_at=server_now, online_since=online_since,
                       lag_ms=lag, max_event_delay_ms=res["max_event_delay_ms"]))
    device.last_sync_at = server_now
    db.commit()
    return {
        "accepted": res["accepted"], "duplicates": res["duplicates"], "rejected": res["rejected"],
        "server_now": server_now.isoformat(), "clock_offset_ms": offset, "attempt_results": res["attempt_results"],
    }


@router.get("/sync/state")
def sync_state(since: str | None = None, me: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Pull-часть. Состояние небольшое, поэтому возвращаем его целиком (since принимается для совместимости)."""
    assignments = []
    for a, c in db.execute(select(CourseAssignment, Course).join(Course, Course.id == CourseAssignment.course_id)
                           .where(CourseAssignment.user_id == me.id, Course.status == "published")):
        t = db.scalar(select(Test).where(Test.course_id == c.id))
        assignments.append({
            "id": str(a.id), "course_id": str(c.id), "title": c.title, "description": c.description, "version": c.version,
            "cover_color": c.cover_color, "pass_score": c.pass_score, "due_date": a.due_date.isoformat() if a.due_date else None,
            "materials_count": sum(1 for m in c.materials if m.type != "link"),  # ссылки не входят в прогресс
            "test_id": str(t.id) if t else None, "max_attempts": t.max_attempts if t else None,
        })
    tests = {t.id: t for t in db.scalars(select(Test))}
    courses = {c.id: c for c in db.scalars(select(Course))}
    attempts = [attempt_out(db, a, tests, courses) for a in db.scalars(select(TestAttempt).where(TestAttempt.user_id == me.id))]
    certs = [{"id": str(c.id), "number": c.number, "verify_code": c.verify_code, "course_id": str(c.course_id),
              "course_title": courses[c.course_id].title if c.course_id in courses else "", "issued_at": c.issued_at.isoformat()}
             for c in db.scalars(select(Certificate).where(Certificate.user_id == me.id))]
    tasks = db.scalars(select(AssessmentRater).join(Assessment, Assessment.id == AssessmentRater.assessment_id).where(
        AssessmentRater.rater_id == me.id, Assessment.status == "open", AssessmentRater.completed_at.is_(None)))
    return {
        "server_now": datetime.now(timezone.utc).isoformat(),
        "since": since,
        "assignments": assignments,
        "attempts": attempts,
        "certificates": certs,
        "open_assessment_tasks": len(list(tasks)),
    }


@router.post("/sync/qr")
def sync_qr(body: QrIn, me: User = Depends(require_role(*STAFF_MANAGER)), db: Session = Depends(get_db)):
    return receive_qr(db, me, body.batch_id, body.data)

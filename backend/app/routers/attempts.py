import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import AttemptAnswer, Certificate, Course, Device, Question, Test, TestAttempt, User
from app.schemas import AttemptIn, ReviewIn
from app.security import STAFF, api_error, get_current_user, require_role
from app.services.grading import keyword_stem, normalize
from app.services.sync_service import Reject, attempt_result, regrade_attempt, save_attempt

router = APIRouter(tags=["attempts"])


@router.post("/attempts")
def submit_attempt(body: AttemptIn, me: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Онлайн-сдача: та же логика, что в /sync (source=online)."""
    device = db.get(Device, body.device_id) if body.device_id else None
    if device and device.user_id != me.id:
        device = None
    try:
        with db.begin_nested():
            _, att = save_attempt(db, me, device, body.id, body.payload, "online", device.clock_offset_ms if device else 0)
    except Reject as e:
        raise api_error(409, e.reason, "Попытка отклонена")
    db.commit()
    return attempt_result(db, att)


def attempt_out(db: Session, a: TestAttempt, tests: dict, courses: dict) -> dict:
    t = tests.get(a.test_id)
    c = courses.get(t.course_id) if t else None
    cert = db.scalar(select(Certificate).where(Certificate.attempt_id == a.id))
    return {
        "id": str(a.id), "test_id": str(a.test_id), "course_id": str(c.id) if c else None, "course_title": c.title if c else "",
        "course_version": a.course_version, "score": float(a.score), "client_score": float(a.client_score) if a.client_score is not None else None,
        "status": a.status, "source": a.source, "started_at": a.started_at.isoformat() if a.started_at else None,
        "finished_at": a.finished_at.isoformat() if a.finished_at else None,
        "certificate": {"id": str(cert.id), "number": cert.number, "verify_code": cert.verify_code} if cert else None,
    }


@router.get("/attempts/my")
def my_attempts(me: User = Depends(get_current_user), db: Session = Depends(get_db)):
    tests = {t.id: t for t in db.scalars(select(Test))}
    courses = {c.id: c for c in db.scalars(select(Course))}
    rows = db.scalars(select(TestAttempt).where(TestAttempt.user_id == me.id).order_by(TestAttempt.finished_at.desc()))
    return [attempt_out(db, a, tests, courses) for a in rows]


# ---------------------------------------------------------------- проверка открытых ответов
@router.get("/reviews")
def review_queue(_: User = Depends(require_role(*STAFF)), db: Session = Depends(get_db)):
    q = (select(AttemptAnswer, TestAttempt, Question, User)
         .join(TestAttempt, TestAttempt.id == AttemptAnswer.attempt_id)
         .join(Question, Question.id == AttemptAnswer.question_id)
         .join(User, User.id == TestAttempt.user_id)
         .where(AttemptAnswer.needs_review.is_(True), AttemptAnswer.reviewed_at.is_(None))
         .order_by(TestAttempt.finished_at))
    tests = {t.id: t for t in db.scalars(select(Test))}
    courses = {c.id: c for c in db.scalars(select(Course))}
    out = []
    for ans, att, qu, u in db.execute(q).unique():
        words = normalize(ans.answer_text)
        found = [k for k in (qu.keywords or []) if keyword_stem(k) and any(w.startswith(keyword_stem(k)) for w in words)]
        t = tests.get(att.test_id)
        out.append({
            "answer_id": str(ans.id), "attempt_id": str(att.id), "full_name": u.full_name,
            "department": u.department.name if u.department else "", "course_title": courses[t.course_id].title if t else "",
            "question": qu.body, "points": float(qu.points), "answer_text": ans.answer_text, "keywords": list(qu.keywords or []),
            "keywords_min": qu.keywords_min, "found_keywords": found,
            "finished_at": att.finished_at.isoformat() if att.finished_at else None,
        })
    return out


@router.post("/reviews/{answer_id}")
def review(answer_id: uuid.UUID, body: ReviewIn, me: User = Depends(require_role(*STAFF)), db: Session = Depends(get_db)):
    ans = db.get(AttemptAnswer, answer_id)
    if not ans:
        raise api_error(404, "not_found", "Ответ не найден")
    q = db.get(Question, ans.question_id)
    ans.is_correct = body.accept
    ans.points = float(q.points) if body.accept else 0
    ans.needs_review = False
    ans.reviewed_by = me.id
    ans.reviewed_at = datetime.now(timezone.utc)
    db.flush()
    attempt = db.get(TestAttempt, ans.attempt_id)
    db.refresh(attempt)
    regrade_attempt(db, attempt)
    db.commit()
    return attempt_result(db, attempt)

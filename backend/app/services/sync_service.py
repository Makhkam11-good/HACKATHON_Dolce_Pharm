"""Приём пачки синхронизации (раздел 7.6): дедупликация, смещение часов, пересчёт оценок.

Используется и сетевым /sync, и /sync/qr, и онлайн-сдачей /attempts.
"""
import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import (
    ActivityEvent,
    Assessment,
    AssessmentRater,
    AssessmentResponse,
    AttemptAnswer,
    Certificate,
    Competency,
    Course,
    CourseAssignment,
    Device,
    EventAlias,
    Scenario,
    ScenarioRun,
    Test,
    TestAttempt,
    User,
)
from app.services.certificate_pdf import issue_certificate
from app.services.grading import grade_attempt, summarize
from app.services.package import question_to_grading

log = logging.getLogger("sync")

EVENT_TYPES = {"session_start", "session_end", "material_interval", "test_start", "test_finish"}


class Reject(Exception):
    def __init__(self, reason: str):
        self.reason = reason


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def parse_dt(v) -> datetime | None:
    if not v:
        return None
    try:
        d = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except ValueError:
        raise Reject("bad_datetime")
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def to_uuid(v, required=True) -> uuid.UUID | None:
    if v in (None, ""):
        if required:
            raise Reject("missing_id")
        return None
    try:
        return uuid.UUID(str(v))
    except ValueError:
        raise Reject("bad_uuid")


def shift(d: datetime | None, offset_ms: int) -> datetime | None:
    return d + timedelta(milliseconds=offset_ms) if d else None


# ---------------------------------------------------------------- события
def _event(db: Session, user: User, device: Device | None, iid: uuid.UUID, p: dict, source: str, offset_ms: int) -> bool:
    if db.get(EventAlias, iid):
        return False
    if p.get("type") not in EVENT_TYPES:
        raise Reject("bad_event_type")
    started_c = parse_dt(p.get("started_at_client"))
    if not started_c:
        raise Reject("missing_started_at")
    ended_c = parse_dt(p.get("ended_at_client"))
    duration = int(p.get("duration_ms") or 0)
    if duration < 0 or duration > 24 * 3600 * 1000:
        raise Reject("bad_duration")
    src = "online" if (source == "sync" and p.get("created_online")) else source
    row = {
        "id": iid,
        "user_id": user.id,
        "device_id": device.id if device else None,
        "course_id": to_uuid(p.get("course_id"), required=False),
        "material_id": to_uuid(p.get("material_id"), required=False),
        "type": p["type"],
        "client_seq": int(p.get("client_seq") or 0),
        "started_at_client": started_c,
        "ended_at_client": ended_c,
        "started_at": shift(started_c, offset_ms),
        "ended_at": shift(ended_c, offset_ms),
        "duration_ms": duration,
        "source": src,
        "synced_at": now_utc(),
    }
    res = db.execute(pg_insert(ActivityEvent).values(**row).on_conflict_do_nothing(index_elements=["id"]).returning(ActivityEvent.id))
    inserted = res.scalar() is not None
    if inserted:
        for alias in p.get("merged_ids") or []:
            a = to_uuid(alias)
            if a != iid:
                db.execute(pg_insert(EventAlias).values(alias_id=a, event_id=iid).on_conflict_do_nothing())
    return inserted


# ---------------------------------------------------------------- попытки
def regrade_attempt(db: Session, attempt: TestAttempt) -> None:
    """Пересчёт итогов попытки по сохранённым ответам (после ручной проверки)."""
    test = db.get(Test, attempt.test_id)
    course = db.get(Course, test.course_id)
    results = [
        {"points": float(a.points or 0), "needs_review": a.needs_review} for a in attempt.answers
    ]
    points_max = sum(float(q.points) for q in test.questions)
    s = summarize(results, points_max, course.pass_score)
    attempt.points_earned = s["points_earned"]
    attempt.points_max = s["points_max"]
    attempt.score = s["score"]
    attempt.status = s["status"]
    attempt.updated_at = now_utc()
    if attempt.status == "passed":
        issue_certificate(db, attempt, course)


def attempt_result(db: Session, a: TestAttempt) -> dict:
    cert = db.scalar(select(Certificate).where(Certificate.attempt_id == a.id))
    return {
        "id": str(a.id),
        "test_id": str(a.test_id),
        "score": float(a.score),
        "status": a.status,
        "certificate_number": cert.number if cert else None,
    }


def save_attempt(db: Session, user: User, device: Device | None, iid: uuid.UUID, p: dict, source: str, offset_ms: int) -> tuple[bool, TestAttempt]:
    existing = db.get(TestAttempt, iid)
    if existing:
        if existing.user_id != user.id:
            raise Reject("id_conflict")
        return False, existing
    test = db.get(Test, to_uuid(p.get("test_id")))
    if not test:
        raise Reject("unknown_test")
    course = db.get(Course, test.course_id)
    used_q = select(func.count()).select_from(TestAttempt).where(TestAttempt.user_id == user.id, TestAttempt.test_id == test.id)
    asg = db.scalar(select(CourseAssignment).where(CourseAssignment.user_id == user.id, CourseAssignment.course_id == test.course_id))
    if asg and asg.reset_at:  # после повторного обучения попытки считаются заново
        used_q = used_q.where(func.coalesce(TestAttempt.finished_at, TestAttempt.created_at) >= asg.reset_at)
    used = db.scalar(used_q)
    if used >= test.max_attempts:
        raise Reject("attempt_limit_exceeded")

    answers_in: dict[str, dict] = {}
    for a in p.get("answers") or []:
        qid = str(a.get("question_id"))
        answers_in[qid] = {
            "selected_option_ids": [str(x) for x in (a.get("selected_option_ids") or [])],
            "order_option_ids": [str(x) for x in (a.get("order_option_ids") or [])],
            "answer_text": a.get("answer_text"),
        }
    qdicts = [question_to_grading(q) for q in test.questions]
    g = grade_attempt(qdicts, answers_in, course.pass_score)
    client_score = p.get("client_score")
    src = "online" if (source == "sync" and p.get("created_online")) else source
    attempt = TestAttempt(
        id=iid, test_id=test.id, user_id=user.id, device_id=device.id if device else None,
        course_version=int(p.get("course_version") or course.version),
        started_at=shift(parse_dt(p.get("started_at")), offset_ms),
        finished_at=shift(parse_dt(p.get("finished_at")), offset_ms),
        client_score=float(client_score) if client_score is not None else None,
        score=g["score"], points_earned=g["points_earned"], points_max=g["points_max"],
        status=g["status"], source=src, synced_at=now_utc(),
    )
    db.add(attempt)
    db.flush()
    for r in g["answers"]:
        ans = answers_in.get(r["question_id"], {})
        db.add(AttemptAnswer(
            attempt_id=attempt.id, question_id=uuid.UUID(r["question_id"]),
            selected_option_ids=[uuid.UUID(x) for x in ans.get("selected_option_ids", []) if _is_uuid(x)] or None,
            order_option_ids=[uuid.UUID(x) for x in ans.get("order_option_ids", []) if _is_uuid(x)] or None,
            answer_text=ans.get("answer_text"), is_correct=r["is_correct"], points=r["points"],
            needs_review=r["needs_review"], matched_keywords=r["matched_keywords"],
        ))
    db.flush()
    if attempt.status == "passed":
        issue_certificate(db, attempt, course)
    return True, attempt


def _is_uuid(x) -> bool:
    try:
        uuid.UUID(str(x))
        return True
    except ValueError:
        return False


# ---------------------------------------------------------------- 360 и тренажёр
def _assessment_response(db: Session, user: User, iid: uuid.UUID, p: dict) -> bool:
    if db.get(AssessmentResponse, iid):
        return False
    assessment = db.get(Assessment, to_uuid(p.get("assessment_id")))
    if not assessment:
        raise Reject("unknown_assessment")
    if assessment.status != "open":
        raise Reject("assessment_closed")
    rater = db.scalar(select(AssessmentRater).where(AssessmentRater.assessment_id == assessment.id, AssessmentRater.rater_id == user.id))
    if not rater:
        raise Reject("not_a_rater")
    comp_id = to_uuid(p.get("competency_id"))
    if not db.get(Competency, comp_id):
        raise Reject("unknown_competency")
    score = int(p.get("score") or 0)
    if not 1 <= score <= 5:
        raise Reject("bad_score")
    stmt = pg_insert(AssessmentResponse).values(
        id=iid, assessment_id=assessment.id, rater_id=user.id, rater_role=rater.rater_role,
        competency_id=comp_id, score=score, comment=p.get("comment"),
    ).on_conflict_do_update(
        index_elements=["assessment_id", "rater_id", "competency_id"],
        set_={"score": score, "comment": p.get("comment")},
    )
    db.execute(stmt)
    mark_rater_completed(db, rater)
    return True


def mark_rater_completed(db: Session, rater: AssessmentRater) -> None:
    total = db.scalar(select(func.count()).select_from(Competency))
    done = db.scalar(select(func.count()).select_from(AssessmentResponse).where(
        AssessmentResponse.assessment_id == rater.assessment_id, AssessmentResponse.rater_id == rater.rater_id))
    if total and done >= total and not rater.completed_at:
        rater.completed_at = now_utc()


def _scenario_run(db: Session, user: User, iid: uuid.UUID, p: dict, source: str, offset_ms: int) -> bool:
    scen = db.get(Scenario, to_uuid(p.get("scenario_id")))
    if not scen:
        raise Reject("unknown_scenario")
    res = db.execute(pg_insert(ScenarioRun).values(
        id=iid, scenario_id=scen.id, user_id=user.id, path=list(p.get("path") or []),
        total_score=int(p.get("total_score") or 0), max_score=int(p.get("max_score") or 0),
        finished_at=shift(parse_dt(p.get("finished_at")), offset_ms) or now_utc(),
        source=source, synced_at=now_utc(),
    ).on_conflict_do_nothing(index_elements=["id"]).returning(ScenarioRun.id))
    return res.scalar() is not None


# ---------------------------------------------------------------- пачка
def process_items(db: Session, user: User, device: Device | None, items: list[dict], source: str, offset_ms: int) -> dict:
    accepted, duplicates, rejected, attempt_results = [], [], [], []
    stats = {"events": 0, "attempts": 0, "assessment_responses": 0, "scenario_runs": 0}
    max_delay = None
    for item in items:
        raw_id = item.get("id")
        kind = item.get("kind")
        p = item.get("payload") or {}
        try:
            with db.begin_nested():
                iid = to_uuid(raw_id)
                if p.get("user_id") and str(p["user_id"]) != str(user.id):
                    raise Reject("user_mismatch")
                if kind == "event":
                    new = _event(db, user, device, iid, p, source, offset_ms)
                    if new:
                        stats["events"] += 1
                        end = parse_dt(p.get("ended_at_client") or p.get("started_at_client"))
                        if end:
                            delay = int((now_utc() - shift(end, offset_ms)).total_seconds() * 1000)
                            max_delay = delay if max_delay is None else max(max_delay, delay)
                elif kind == "attempt":
                    new, att = save_attempt(db, user, device, iid, p, source, offset_ms)
                    if new:
                        stats["attempts"] += 1
                    attempt_results.append(attempt_result(db, att))
                elif kind == "assessment_response":
                    new = _assessment_response(db, user, iid, p)
                    if new:
                        stats["assessment_responses"] += 1
                elif kind == "scenario_run":
                    new = _scenario_run(db, user, iid, p, source, offset_ms)
                    if new:
                        stats["scenario_runs"] += 1
                else:
                    raise Reject("unknown_kind")
            (accepted if new else duplicates).append(str(raw_id))
        except Reject as e:
            rejected.append({"id": str(raw_id), "reason": e.reason})
        except IntegrityError:
            duplicates.append(str(raw_id))
        except Exception:  # noqa: BLE001
            log.exception("sync item failed")
            rejected.append({"id": str(raw_id), "reason": "invalid"})
    return {
        "accepted": accepted,
        "duplicates": duplicates,
        "rejected": rejected,
        "attempt_results": attempt_results,
        "stats": stats,
        "max_event_delay_ms": max_delay,
    }

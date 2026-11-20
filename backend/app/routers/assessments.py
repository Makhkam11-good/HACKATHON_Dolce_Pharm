import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Assessment, AssessmentRater, AssessmentResponse, Competency, User
from app.schemas import AssessmentIn, CompetencyIn, ResponsesIn
from app.security import STAFF, STAFF_MANAGER, api_error, get_current_user, require_role
from app.services.assessment import profile
from app.services.sync_service import mark_rater_completed

router = APIRouter(tags=["assessments"])


@router.get("/competencies")
def list_competencies(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [{"id": str(c.id), "name": c.name, "description": c.description} for c in db.scalars(select(Competency).order_by(Competency.name))]


@router.post("/competencies")
def create_competency(body: CompetencyIn, _: User = Depends(require_role(*STAFF)), db: Session = Depends(get_db)):
    c = Competency(name=body.name, description=body.description)
    db.add(c)
    db.commit()
    return {"id": str(c.id), "name": c.name, "description": c.description}


def _can_manage(me: User, subject: User) -> bool:
    return me.role in STAFF or (me.role == "manager" and subject.department_id == me.department_id)


@router.post("/assessments")
def create_assessment(body: AssessmentIn, me: User = Depends(require_role(*STAFF_MANAGER)), db: Session = Depends(get_db)):
    subject = db.get(User, body.subject_id)
    if not subject or not _can_manage(me, subject):
        raise api_error(403, "forbidden", "Нельзя запустить оценку для этого сотрудника")
    a = Assessment(subject_id=subject.id, title=body.title or f"Оценка {'360' if body.peer_ids else '180'}: {subject.full_name}",
                   period=body.period, created_by=me.id)
    db.add(a)
    db.flush()
    manager_id = subject.manager_id or me.id
    raters = [(subject.id, "self")]
    if manager_id != subject.id:
        raters.append((manager_id, "manager"))
    for pid in body.peer_ids:
        if pid not in (subject.id, manager_id):
            raters.append((pid, "peer"))
    for rid, role in raters:
        db.execute(pg_insert(AssessmentRater).values(id=uuid.uuid4(), assessment_id=a.id, rater_id=rid, rater_role=role)
                   .on_conflict_do_nothing())
    db.commit()
    return profile(db, a)


@router.get("/assessments")
def list_assessments(me: User = Depends(require_role(*STAFF_MANAGER)), db: Session = Depends(get_db)):
    q = select(Assessment, User).join(User, User.id == Assessment.subject_id)
    if me.role == "manager":
        q = q.where(User.department_id == me.department_id)
    out = []
    for a, u in db.execute(q.order_by(Assessment.created_at.desc())).unique():
        raters = list(db.scalars(select(AssessmentRater).where(AssessmentRater.assessment_id == a.id)))
        out.append({"id": str(a.id), "title": a.title, "period": a.period, "status": a.status, "subject_id": str(u.id),
                    "subject_name": u.full_name, "raters_total": len(raters),
                    "raters_done": sum(r.completed_at is not None for r in raters),
                    "kind": "360" if any(r.rater_role == "peer" for r in raters) else "180"})
    return out


@router.get("/assessments/my-tasks")
def my_tasks(me: User = Depends(get_current_user), db: Session = Depends(get_db)):
    comps = [{"id": str(c.id), "name": c.name, "description": c.description} for c in db.scalars(select(Competency).order_by(Competency.name))]
    out = []
    q = (select(AssessmentRater, Assessment, User).join(Assessment, Assessment.id == AssessmentRater.assessment_id)
         .join(User, User.id == Assessment.subject_id)
         .where(AssessmentRater.rater_id == me.id, Assessment.status == "open"))
    for r, a, subj in db.execute(q).unique():
        answers = {str(x.competency_id): {"score": x.score, "comment": x.comment} for x in db.scalars(
            select(AssessmentResponse).where(AssessmentResponse.assessment_id == a.id, AssessmentResponse.rater_id == me.id))}
        out.append({"id": str(a.id), "title": a.title, "period": a.period, "subject_id": str(subj.id), "subject_name": subj.full_name,
                    "subject_position": subj.position, "rater_role": r.rater_role, "completed": r.completed_at is not None,
                    "competencies": comps, "answers": answers})
    return out


@router.post("/assessments/{assessment_id}/responses")
def submit_responses(assessment_id: uuid.UUID, body: ResponsesIn, me: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = db.get(Assessment, assessment_id)
    if not a or a.status != "open":
        raise api_error(409, "assessment_closed", "Оценка закрыта")
    rater = db.scalar(select(AssessmentRater).where(AssessmentRater.assessment_id == a.id, AssessmentRater.rater_id == me.id))
    if not rater:
        raise api_error(403, "not_a_rater", "Вы не оценщик")
    for r in body.responses:
        db.execute(pg_insert(AssessmentResponse).values(
            id=r.id or uuid.uuid4(), assessment_id=a.id, rater_id=me.id, rater_role=rater.rater_role,
            competency_id=r.competency_id, score=r.score, comment=r.comment,
        ).on_conflict_do_update(index_elements=["assessment_id", "rater_id", "competency_id"],
                                set_={"score": r.score, "comment": r.comment}))
    db.flush()
    mark_rater_completed(db, rater)
    db.commit()
    return {"ok": True, "completed": rater.completed_at is not None}


@router.get("/assessments/{assessment_id}/profile")
def get_profile(assessment_id: uuid.UUID, me: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = db.get(Assessment, assessment_id)
    if not a:
        raise api_error(404, "not_found", "Оценка не найдена")
    subject = db.get(User, a.subject_id)
    if me.id != subject.id and not _can_manage(me, subject):
        raise api_error(403, "forbidden", "Нет доступа")
    return profile(db, a)


@router.post("/assessments/{assessment_id}/close")
def close(assessment_id: uuid.UUID, me: User = Depends(require_role(*STAFF_MANAGER)), db: Session = Depends(get_db)):
    a = db.get(Assessment, assessment_id)
    if not a or not _can_manage(me, db.get(User, a.subject_id)):
        raise api_error(403, "forbidden", "Нет доступа")
    a.status = "closed"
    db.commit()
    return profile(db, a)

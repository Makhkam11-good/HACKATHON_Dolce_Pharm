import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import AnswerOption, Question, Test, User
from app.routers.courses import get_course
from app.schemas import TestIn
from app.security import STAFF, api_error, require_role
from app.services.package import new_salt

router = APIRouter(tags=["tests"])


def test_out(t: Test | None) -> dict | None:
    if not t:
        return None
    return {
        "id": str(t.id), "course_id": str(t.course_id), "title": t.title, "time_limit_min": t.time_limit_min,
        "max_attempts": t.max_attempts, "shuffle_questions": t.shuffle_questions,
        "questions": [{
            "id": str(q.id), "position": q.position, "type": q.type, "body": q.body, "points": float(q.points),
            "keywords": list(q.keywords or []), "keywords_min": q.keywords_min, "explanation": q.explanation,
            "options": [{"id": str(o.id), "text": o.text, "is_correct": o.is_correct, "correct_order": o.correct_order}
                        for o in q.options],
        } for q in t.questions],
    }


def validate(body: TestIn):
    for i, q in enumerate(body.questions, 1):
        if not q.body.strip():
            raise api_error(422, "empty_question", f"Вопрос {i}: пустой текст")
        if q.type in ("single", "multi", "order") and len(q.options) < 2:
            raise api_error(422, "few_options", f"Вопрос {i}: нужно минимум 2 варианта")
        correct = sum(o.is_correct for o in q.options)
        if q.type == "single" and correct != 1:
            raise api_error(422, "single_correct", f"Вопрос {i}: в одиночном выборе ровно 1 верный вариант")
        if q.type == "multi" and correct < 1:
            raise api_error(422, "multi_correct", f"Вопрос {i}: отметьте хотя бы один верный вариант")
        if q.type == "open" and not [k for k in (q.keywords or []) if k.strip()]:
            raise api_error(422, "keywords_required", f"Вопрос {i}: добавьте ключевые слова")


@router.get("/courses/{course_id}/test")
def get_test(course_id: uuid.UUID, _: User = Depends(require_role(*STAFF)), db: Session = Depends(get_db)):
    get_course(db, course_id)
    return test_out(db.scalar(select(Test).where(Test.course_id == course_id)))


@router.put("/courses/{course_id}/test")
def put_test(course_id: uuid.UUID, body: TestIn, _: User = Depends(require_role(*STAFF)), db: Session = Depends(get_db)):
    """Полная замена теста. id вопросов/вариантов сохраняются, если переданы (стабильность для офлайн-попыток)."""
    get_course(db, course_id)
    validate(body)
    t = db.scalar(select(Test).where(Test.course_id == course_id))
    if not t:
        t = Test(course_id=course_id, title=body.title, salt=new_salt())
        db.add(t)
        db.flush()
    t.title, t.time_limit_min, t.max_attempts, t.shuffle_questions = body.title, body.time_limit_min, body.max_attempts, body.shuffle_questions
    old_q = {q.id: q for q in t.questions}
    keep = []
    for qi, qin in enumerate(body.questions, 1):
        q = old_q.get(qin.id) if qin.id else None
        if q is None:
            q = Question(id=qin.id or uuid.uuid4(), test_id=t.id)
            db.add(q)
        q.position, q.type, q.body, q.points = qi, qin.type, qin.body, qin.points
        kws = [k.strip() for k in (qin.keywords or []) if k.strip()]
        q.keywords = kws if qin.type == "open" else None
        q.keywords_min = (qin.keywords_min or 1) if qin.type == "open" else None
        q.explanation = qin.explanation
        db.flush()
        old_o = {o.id: o for o in q.options}
        new_opts = []
        for oi, oin in enumerate(qin.options if qin.type != "open" else [], 1):
            o = old_o.pop(oin.id, None) if oin.id else None
            if o is None:
                o = AnswerOption(id=oin.id or uuid.uuid4(), question_id=q.id)
            o.position, o.text = oi, oin.text
            o.is_correct = oin.is_correct if qin.type in ("single", "multi") else False
            o.correct_order = oi if qin.type == "order" else None  # порядок в редакторе = правильный
            new_opts.append(o)
        q.options = new_opts
        keep.append(q)
    for qid, q in old_q.items():
        if q not in keep:
            db.delete(q)
    db.commit()
    db.refresh(t)
    return test_out(t)

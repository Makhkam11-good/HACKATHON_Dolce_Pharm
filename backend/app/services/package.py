"""Сборка офлайн-пакета курса (раздел 7.2) и хэши ответов (раздел 8.2).

Зеркало хэшей на клиенте: frontend/src/offline/answerHash.ts.
"""
import hashlib
import random
import secrets
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Course, Question, Scenario, Test
from app.services.grading import keyword_stems


def sha(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def new_salt() -> str:
    return secrets.token_hex(16)


def single_hash(salt: str, qid: str, option_id: str) -> str:
    return sha(f"{salt}:{qid}:{option_id}")


def option_hash(salt: str, option_id: str, correct: bool) -> str:
    return sha(f"{salt}:{option_id}:{'1' if correct else '0'}")


def position_hash(salt: str, qid: str, i: int, option_id: str) -> str:
    return sha(f"{salt}:{qid}:{i}:{option_id}")


def keyword_hash(salt: str, stem: str) -> str:
    return sha(f"{salt}:{stem}")


def question_to_grading(q: Question) -> dict:
    return {
        "id": str(q.id),
        "type": q.type,
        "points": float(q.points),
        "keywords": list(q.keywords or []),
        "keywords_min": q.keywords_min,
        "options": [
            {"id": str(o.id), "is_correct": o.is_correct, "correct_order": o.correct_order} for o in q.options
        ],
    }


def hashed_question(salt: str, q: Question) -> dict:
    qid = str(q.id)
    base = {"id": qid, "type": q.type, "body": q.body, "points": float(q.points), "explanation": q.explanation or ""}
    if q.type == "single":
        base["options"] = [{"id": str(o.id), "text": o.text} for o in q.options]
        correct = next((o for o in q.options if o.is_correct), None)
        base["answer_hash"] = single_hash(salt, qid, str(correct.id)) if correct else ""
    elif q.type == "multi":
        base["options"] = [
            {"id": str(o.id), "text": o.text, "option_hash": option_hash(salt, str(o.id), o.is_correct)} for o in q.options
        ]
    elif q.type == "order":
        ordered = sorted(q.options, key=lambda o: o.correct_order or 0)
        shuffled = list(q.options)
        if len(shuffled) > 1:
            for _ in range(10):
                random.shuffle(shuffled)
                if [o.id for o in shuffled] != [o.id for o in ordered]:
                    break
        base["options"] = [{"id": str(o.id), "text": o.text} for o in shuffled]
        base["position_hashes"] = [position_hash(salt, qid, i, str(o.id)) for i, o in enumerate(ordered)]
    elif q.type == "open":
        stems = keyword_stems(q.keywords)
        base["keyword_hashes"] = [keyword_hash(salt, s) for s in stems]
        base["keywords_min"] = q.keywords_min or 1
    return base


def test_package(test: Test) -> dict:
    return {
        "id": str(test.id),
        "title": test.title,
        "time_limit_min": test.time_limit_min,
        "max_attempts": test.max_attempts,
        "shuffle_questions": test.shuffle_questions,
        "salt": test.salt,
        "questions": [hashed_question(test.salt, q) for q in test.questions],
    }


def material_package(m) -> dict:
    d = {"id": str(m.id), "position": m.position, "type": m.type, "title": m.title, "min_seconds": m.min_seconds}
    if m.type == "text":
        d["body_md"] = m.body_md or ""
    elif m.type == "link":
        d["url"] = m.url
    elif m.file is not None:
        f = m.file
        d["file"] = {
            "id": str(f.id),
            "url": f"/api/files/{f.id}/offline",
            "mime": f.offline_mime or f.mime,
            "size": f.offline_size_bytes,
            "sha256": f.sha256,
            "status": f.conversion_status,
        }
    return d


def scenario_package(s: Scenario) -> dict:
    return {"id": str(s.id), "title": s.title, "description": s.description, "course_id": str(s.course_id) if s.course_id else None, "data": s.data}


def build_package(db: Session, course: Course) -> dict:
    test = db.scalar(select(Test).where(Test.course_id == course.id))
    scenario = db.scalar(select(Scenario).where(Scenario.course_id == course.id))
    materials = [m for m in course.materials if m.type in ("text", "link") or (m.file and m.file.conversion_status == "ready")]
    return {
        "course": {
            "id": str(course.id),
            "title": course.title,
            "version": course.version,
            "pass_score": course.pass_score,
            "description": course.description,
            "cover_color": course.cover_color,
        },
        "materials": [material_package(m) for m in materials],
        "test": test_package(test) if test and test.questions else None,
        "scenario": scenario_package(scenario) if scenario else None,
        "package_built_at": datetime.now(timezone.utc).isoformat(),
    }

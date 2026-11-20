"""Агрегация оценки 180/360 (раздел 11)."""
from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Assessment, AssessmentRater, AssessmentResponse, Competency, Course, User, course_competencies
from app.services.reports import assignment_states


def _avg(xs):
    return round(sum(xs) / len(xs), 2) if xs else None


def profile(db: Session, a: Assessment) -> dict:
    comps = list(db.scalars(select(Competency).order_by(Competency.name)))
    responses = list(db.scalars(select(AssessmentResponse).where(AssessmentResponse.assessment_id == a.id)))
    raters = list(db.scalars(select(AssessmentRater).where(AssessmentRater.assessment_id == a.id)))
    by = defaultdict(lambda: defaultdict(list))
    comments = []
    users = {u.id: u.full_name for u in db.scalars(select(User))}
    for r in responses:
        by[r.competency_id][r.rater_role].append(r.score)
        if r.comment:
            comments.append({"competency_id": str(r.competency_id), "rater_role": r.rater_role, "comment": r.comment})
    rows = []
    for c in comps:
        d = by[c.id]
        self_ = _avg(d["self"])
        mgr = _avg(d["manager"])
        peers = _avg(d["peer"])
        others = _avg(d["manager"] + d["peer"])
        gap = round(self_ - others, 2) if self_ is not None and others is not None else None
        rows.append({"competency_id": str(c.id), "name": c.name, "self": self_, "manager": mgr, "peers": peers,
                     "others": others, "gap": gap, "gap_flag": gap is not None and abs(gap) >= 1})
    weak = [r["competency_id"] for r in rows if r["others"] is not None and r["others"] < 3]
    recs = []
    if weak:
        q = (select(Course, course_competencies.c.competency_id)
             .join(course_competencies, course_competencies.c.course_id == Course.id)
             .where(course_competencies.c.competency_id.in_(weak), Course.status == "published"))
        seen = {}
        names = {r["competency_id"]: r["name"] for r in rows}
        for course, cid in db.execute(q):
            e = seen.setdefault(course.id, {"course_id": str(course.id), "title": course.title, "competencies": []})
            e["competencies"].append(names[str(cid)])
        recs = list(seen.values())
        subject = db.get(User, a.subject_id)
        states = assignment_states(db, subject) if subject else {}
        for r in recs:
            st = states.get(r["course_id"])
            r["assignment"] = None if st is None else {
                "status": st["status"], "status_ru": st["status_ru"], "due_date": st["due_date_iso"],
                "overdue": st["overdue"], "attempts": st["attempts"], "best_score": st["best_score"],
            }
    return {
        "assessment": {"id": str(a.id), "title": a.title, "period": a.period, "status": a.status,
                       "subject_id": str(a.subject_id), "subject_name": users.get(a.subject_id, "")},
        "kind": "360" if any(r.rater_role == "peer" for r in raters) else "180",
        "raters": [{"rater_id": str(r.rater_id), "name": users.get(r.rater_id, ""), "role": r.rater_role,
                    "completed": r.completed_at is not None} for r in raters],
        "rows": rows,
        "weak_competencies": weak,
        "recommendations": recs,
        "comments": comments,
    }

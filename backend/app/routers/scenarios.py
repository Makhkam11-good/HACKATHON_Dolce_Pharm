import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import CourseAssignment, Scenario, User
from app.schemas import ScenarioIn
from app.security import STAFF, api_error, get_current_user, require_role
from app.services.package import scenario_package

router = APIRouter(tags=["scenarios"])


def validate_graph(data: dict) -> str:
    nodes = data.get("nodes")
    start = data.get("start")
    if not isinstance(nodes, dict) or not nodes:
        raise api_error(422, "no_nodes", "В сценарии нет узлов (nodes)")
    if start not in nodes:
        raise api_error(422, "bad_start", "Стартовый узел (start) не найден")
    for nid, n in nodes.items():
        if n.get("end"):
            continue
        choices = n.get("choices") or []
        if not choices:
            raise api_error(422, "dead_end", f"Узел «{nid}» без вариантов и не помечен как концовка")
        for ch in choices:
            if ch.get("next") not in nodes:
                raise api_error(422, "bad_next", f"Узел «{nid}»: переход на несуществующий узел «{ch.get('next')}»")
    return start


@router.get("/scenarios")
def list_scenarios(me: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = select(Scenario)
    if me.role not in STAFF:
        assigned = select(CourseAssignment.course_id).where(CourseAssignment.user_id == me.id)
        q = q.where(or_(Scenario.course_id.is_(None), Scenario.course_id.in_(assigned)))
    return [scenario_package(s) for s in db.scalars(q.order_by(Scenario.title))]


@router.post("/scenarios")
def create_scenario(body: ScenarioIn, _: User = Depends(require_role(*STAFF)), db: Session = Depends(get_db)):
    start = validate_graph(body.data)
    s = Scenario(title=body.title, description=body.description, course_id=body.course_id, start_node_id=start, data=body.data)
    db.add(s)
    db.commit()
    return scenario_package(s)


@router.get("/scenarios/{scenario_id}")
def get_scenario(scenario_id: uuid.UUID, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = db.get(Scenario, scenario_id)
    if not s:
        raise api_error(404, "not_found", "Сценарий не найден")
    return scenario_package(s)


@router.put("/scenarios/{scenario_id}")
def put_scenario(scenario_id: uuid.UUID, body: ScenarioIn, _: User = Depends(require_role(*STAFF)), db: Session = Depends(get_db)):
    s = db.get(Scenario, scenario_id)
    if not s:
        raise api_error(404, "not_found", "Сценарий не найден")
    s.start_node_id = validate_graph(body.data)
    s.title, s.description, s.course_id, s.data = body.title, body.description, body.course_id, body.data
    db.commit()
    return scenario_package(s)


@router.delete("/scenarios/{scenario_id}")
def delete_scenario(scenario_id: uuid.UUID, _: User = Depends(require_role(*STAFF)), db: Session = Depends(get_db)):
    s = db.get(Scenario, scenario_id)
    if s:
        db.delete(s)
        db.commit()
    return {"ok": True}

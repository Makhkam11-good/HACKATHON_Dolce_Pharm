"""Назначение курсов: новое, повторное (без 500 и без затирания срока), повторное обучение."""
from datetime import date, timedelta

from sqlalchemy import func, select

from app.models import Course, CourseAssignment, TestAttempt
from tests.test_sync import attempt, push


def post(client, w, course_id, **extra):
    return client.post("/api/assignments", headers=w["h_mgr"],
                       json={"course_id": str(course_id), "user_ids": [str(w["emp"].id)], **extra})


def test_assign_new_course(client, db, world):
    c = Course(title="Новый курс", status="published")
    db.add(c)
    db.commit()
    due = (date.today() + timedelta(days=10)).isoformat()
    r = post(client, world, c.id, due_date=due)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["outcome"] == "assigned" and body["assigned"] == 1 and body["already_assigned"] is False
    assert body["status"] == "not_started" and body["status_ru"] == "не начат"
    assert body["due_date"] == due and body["full_name"] == world["emp"].full_name


def test_repeat_assign_returns_status_and_keeps_due_date(client, db, world):
    due = date.today() + timedelta(days=7)
    a = db.scalar(select(CourseAssignment).where(CourseAssignment.user_id == world["emp"].id))
    a.due_date = due
    db.commit()
    push(client, world, [attempt(world, correct=False)])  # сотрудник уже пробовал — статус «не сдал»

    r = post(client, world, world["course"].id)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["outcome"] == "already_assigned" and body["already_assigned"] is True and body["assigned"] == 0
    assert body["status"] == "failed"
    db.refresh(a)
    assert a.due_date == due, "повторное назначение не должно затирать срок"
    assert body["due_date"] == due.isoformat()
    # двойной клик тоже не падает
    assert post(client, world, world["course"].id).status_code == 200


def test_retrain_resets_status_keeps_history_and_attempt_limit(client, db, world):
    test_id = world["test"].id
    push(client, world, [attempt(world, correct=False), attempt(world, correct=True)])  # 2 из 2 попыток, сдал
    r = post(client, world, world["course"].id)
    assert r.json()["status"] == "passed"
    # лимит исчерпан: третья попытка отклоняется
    over = push(client, world, [attempt(world, correct=True)])
    assert over["rejected"] and over["rejected"][0]["reason"] == "attempt_limit_exceeded"

    r = post(client, world, world["course"].id, retrain=True)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["outcome"] == "retrained" and body["retrained"] == 1
    assert body["status"] == "not_started", "после повторного обучения статус с нуля"
    assert body["due_date"] == (date.today() + timedelta(days=14)).isoformat()

    # история попыток сохранена
    total = db.scalar(select(func.count()).select_from(TestAttempt).where(TestAttempt.user_id == world["emp"].id, TestAttempt.test_id == test_id))
    assert total == 2
    # отчёт «Аттестация»: новый цикл — 0 попыток, статус «не начат»
    rows = client.get(f"/api/reports/attestation?user_id={world['emp'].id}", headers=world["h_mgr"]).json()["rows"]
    row = next(x for x in rows if x["course_id"] == str(world["course"].id))
    assert row["status"] == "not_started" and row["attempts"] == 0
    # телефон узнаёт о повторном обучении
    st = client.get("/api/sync/state", headers=world["h_emp"]).json()
    asg = next(x for x in st["assignments"] if x["course_id"] == str(world["course"].id))
    assert asg["reset_at"]
    # лимит попыток считается заново: новая попытка принимается
    again = push(client, world, [attempt(world, correct=True)])
    assert not again["rejected"], again
    assert post(client, world, world["course"].id).json()["status"] == "passed"

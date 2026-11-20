import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

from app.models import ActivityEvent, Certificate, TestAttempt


def iso(d):
    return d.isoformat().replace("+00:00", "Z")


def event(w, etype="material_interval", start=None, dur=60000, eid=None):
    start = start or datetime.now(timezone.utc) - timedelta(minutes=5)
    return {"id": eid or str(uuid.uuid4()), "kind": "event", "payload": {
        "user_id": str(w["emp"].id), "course_id": str(w["course"].id), "type": etype, "client_seq": 1,
        "started_at_client": iso(start), "ended_at_client": iso(start + timedelta(milliseconds=dur)), "duration_ms": dur}}


def attempt(w, correct=True, aid=None):
    return {"id": aid or str(uuid.uuid4()), "kind": "attempt", "payload": {
        "user_id": str(w["emp"].id), "test_id": str(w["test"].id), "course_version": 1, "client_score": 100,
        "started_at": iso(datetime.now(timezone.utc) - timedelta(minutes=3)), "finished_at": iso(datetime.now(timezone.utc)),
        "answers": [{"question_id": str(w["q"].id), "selected_option_ids": [str((w["good"] if correct else w["bad"]).id)]}]}}


def push(client, w, items, client_now=None):
    r = client.post("/api/sync", headers=w["h_emp"], json={
        "device_id": str(w["device"].id), "client_now": iso(client_now or datetime.now(timezone.utc)), "items": items})
    assert r.status_code == 200, r.text
    return r.json()


def count(db, model, **flt):
    q = select(func.count()).select_from(model)
    for k, v in flt.items():
        q = q.where(getattr(model, k) == v)
    return db.scalar(q)


def test_resend_same_batch_creates_no_rows(client, db, world):
    items = [event(world), event(world), event(world, "session_start", dur=0), attempt(world)]
    r1 = push(client, world, items)
    assert len(r1["accepted"]) == 4 and not r1["duplicates"] and not r1["rejected"]
    assert r1["attempt_results"][0]["status"] == "passed"
    before_e = count(db, ActivityEvent, user_id=world["emp"].id)
    before_a = count(db, TestAttempt, user_id=world["emp"].id)
    r2 = push(client, world, items)
    assert sorted(r2["duplicates"]) == sorted(i["id"] for i in items)
    assert not r2["accepted"]
    assert count(db, ActivityEvent, user_id=world["emp"].id) == before_e
    assert count(db, TestAttempt, user_id=world["emp"].id) == before_a
    assert count(db, Certificate, user_id=world["emp"].id) == 1


def test_bad_item_does_not_break_batch(client, db, world):
    bad = event(world)
    bad["payload"]["type"] = "hack"
    foreign = event(world)
    foreign["payload"]["user_id"] = str(uuid.uuid4())
    good1, good2 = event(world), event(world)
    r = push(client, world, [good1, bad, foreign, good2, {"id": "not-a-uuid", "kind": "event", "payload": {}}])
    assert sorted(r["accepted"]) == sorted([good1["id"], good2["id"]])
    reasons = {x["id"]: x["reason"] for x in r["rejected"]}
    assert reasons[bad["id"]] == "bad_event_type"
    assert reasons[foreign["id"]] == "user_mismatch"
    assert reasons["not-a-uuid"] == "bad_uuid"


def test_clock_offset_corrects_times(client, db, world):
    real = datetime.now(timezone.utc)
    phone_now = real - timedelta(hours=3)  # часы телефона отстают на 3 часа
    e = event(world, start=phone_now - timedelta(minutes=10), dur=120000)
    push(client, world, [e], client_now=phone_now)
    row = db.get(ActivityEvent, uuid.UUID(e["id"]))
    expected = real - timedelta(minutes=10)
    assert abs((row.started_at - expected).total_seconds()) < 5
    assert row.duration_ms == 120000


def test_attempt_limit(client, db, world):
    r = push(client, world, [attempt(world, correct=False), attempt(world, correct=False), attempt(world, correct=True)])
    assert len(r["accepted"]) == 2
    assert r["rejected"][0]["reason"] == "attempt_limit_exceeded"


def test_online_attempt_endpoint(client, db, world):
    a = attempt(world)
    r = client.post("/api/attempts", headers=world["h_emp"], json={"id": a["id"], "payload": a["payload"]})
    assert r.status_code == 200 and r.json()["status"] == "passed"
    assert r.json()["certificate_number"].startswith("DP-")
    again = push(client, world, [a])  # та же попытка позже через sync — дубль
    assert again["duplicates"] == [a["id"]]


def test_state(client, world):
    push(client, world, [attempt(world)])
    s = client.get("/api/sync/state", headers=world["h_emp"]).json()
    assert s["assignments"][0]["course_id"] == str(world["course"].id)
    assert s["attempts"][0]["status"] == "passed"
    assert s["certificates"]

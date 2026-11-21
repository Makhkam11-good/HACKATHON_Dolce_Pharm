"""Сквозная проверка API на живом стеке с демо-данными (не входит в pytest).

docker compose exec backend python tests/smoke_api.py
"""
import io
import json
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone

import httpx

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"
c = httpx.Client(base_url=BASE, timeout=60, verify=False)
ok = 0


def check(cond, what):
    global ok
    if not cond:
        print("FAIL:", what)
        sys.exit(1)
    ok += 1
    print("ok  ", what)


def login(name):
    r = c.post("/api/auth/login", json={"login": name, "password": "demo123"})
    check(r.status_code == 200, f"login {name}")
    return {"Authorization": f"Bearer {r.json()['access_token']}"}, r.json()["user"]


iso = lambda d: d.isoformat().replace("+00:00", "Z")  # noqa: E731

check(c.get("/api/health").json()["ok"], "health")
check(c.post("/api/auth/login", json={"login": "op01", "password": "bad"}).status_code == 401, "wrong password → 401")
H_op, op = login("op01")
H_m, _ = login("methodist")
H_mgr, mgr = login("manager1")
H_adm, _ = login("admin")

# роли
check(c.get("/api/users", headers=H_op).status_code == 403, "employee cannot list users")
check(len(c.get("/api/users", headers=H_m).json()) >= 24, "methodist lists users")
mgr_users = c.get("/api/users", headers=H_mgr).json()
check(all(u["department_id"] == mgr["department_id"] for u in mgr_users), "manager sees only own department")

# свежий сотрудник на каждый прогон — тест повторяем
tag = uuid.uuid4().hex[:6]
dept = c.get("/api/departments", headers=H_m).json()[0]
new = c.post("/api/users", headers=H_m, json={"full_name": f"Смоков Тест {tag}", "login": f"smoke_{tag}", "password": "demo123",
                                             "role": "employee", "position": "Аппаратчик", "department_id": dept["id"]}).json()
for cr in c.get("/api/courses", headers=H_m).json():
    if cr["status"] == "published":
        c.post("/api/assignments", headers=H_m, json={"course_id": cr["id"], "user_ids": [new["id"]]})
H_op, op = login(f"smoke_{tag}")
dev = c.post("/api/devices", headers=H_op, json={"name": "smoke"}).json()
check("secret_b64" in dev, "device registered")

state = c.get("/api/sync/state", headers=H_op).json()
check(len(state["assignments"]) >= 3, "new employee has assigned courses")
course_id = state["assignments"][0]["course_id"]
pkg = c.get(f"/api/courses/{course_id}/package", headers=H_op).json()
raw = json.dumps(pkg, ensure_ascii=False)
check("is_correct" not in raw and "correct_order" not in raw and "keywords\"" not in raw, "package has no plain answers")
types = {q["type"] for q in pkg["test"]["questions"]}
check(types == {"single", "multi", "open", "order"}, "test has all 4 question types")
for m in pkg["materials"]:
    if m.get("file"):
        r = c.get(m["file"]["url"], headers=H_op)
        check(r.status_code == 200 and r.headers["etag"].strip('"') == m["file"]["sha256"], f"offline file {m['type']} downloadable with ETag")

# офлайн-сценарий: интервалы + попытка уходят пачкой; часы телефона отстают на 2 часа
phone_now = datetime.now(timezone.utc) - timedelta(hours=2)
events = []
for i, m in enumerate(pkg["materials"]):
    st = phone_now - timedelta(minutes=20 - i * 3)
    events.append({"id": str(uuid.uuid4()), "kind": "event", "payload": {
        "user_id": op["id"], "course_id": course_id, "material_id": m["id"], "type": "material_interval", "client_seq": i + 1,
        "started_at_client": iso(st), "ended_at_client": iso(st + timedelta(seconds=95)), "duration_ms": 95000}})
q_all = c.get(f"/api/courses/{course_id}/test", headers=H_m).json()["questions"]
answers = []
for q in q_all:
    if q["type"] == "single":
        answers.append({"question_id": q["id"], "selected_option_ids": [o["id"] for o in q["options"] if o["is_correct"]]})
    elif q["type"] == "multi":
        answers.append({"question_id": q["id"], "selected_option_ids": [o["id"] for o in q["options"] if o["is_correct"]]})
    elif q["type"] == "order":
        answers.append({"question_id": q["id"], "order_option_ids": [o["id"] for o in sorted(q["options"], key=lambda o: o["correct_order"])]})
    else:
        answers.append({"question_id": q["id"], "answer_text": " ".join(q["keywords"])})
att_id = str(uuid.uuid4())
items = events + [{"id": att_id, "kind": "attempt", "payload": {"user_id": op["id"], "test_id": pkg["test"]["id"], "course_version": pkg["course"]["version"],
                                                               "started_at": iso(phone_now - timedelta(minutes=5)), "finished_at": iso(phone_now), "client_score": 100, "answers": answers}}]
t0 = time.time()
r = c.post("/api/sync", headers=H_op, json={"device_id": dev["device_id"], "client_now": iso(phone_now),
                                            "online_since": iso(phone_now - timedelta(seconds=3)), "items": items}).json()
check(len(r["accepted"]) == len(items), f"sync accepted {len(items)} items in {time.time() - t0:.2f}s")
check(r["attempt_results"][0]["status"] == "passed" and r["attempt_results"][0]["certificate_number"], "attempt passed, certificate issued")
check(abs(r["clock_offset_ms"] - 7200000) < 10000, "clock offset ≈ 2h detected")
r2 = c.post("/api/sync", headers=H_op, json={"device_id": dev["device_id"], "client_now": iso(phone_now), "items": items}).json()
check(len(r2["duplicates"]) == len(items) and not r2["accepted"], "resend → all duplicates")

# отчёты
mt = c.get(f"/api/reports/materials-time?user_id={op['id']}", headers=H_m).json()
check(any(row["total_ms"] == 95000 for row in mt["rows"]), "materials-time report has 95 s interval")
att = c.get(f"/api/reports/attestation?user_id={op['id']}&course_id={course_id}", headers=H_m).json()
check(att["rows"][0]["status"] == "passed", "attestation report: passed")
sync_rep = c.get("/api/reports/sync", headers=H_m).json()
check(any(row["lag"] and row["ok"].startswith("≤") for row in sync_rep["rows"]), "sync report shows lag ≤ 60 s")
summary = c.get("/api/reports/summary", headers=H_mgr).json()
check(summary["cards"]["assigned"] > 0, "manager summary")
for name in ("sessions", "materials-time", "attestation", "summary", "sync"):
    x = c.get(f"/api/reports/{name}/export?format=xlsx", headers=H_m)
    check(x.status_code == 200 and x.content[:2] == b"PK", f"export {name}.xlsx")
    y = c.get(f"/api/reports/{name}/export?format=csv", headers=H_m)
    check(y.content[:3] == b"\xef\xbb\xbf" and ";" in y.content.decode("utf-8-sig").splitlines()[0], f"export {name}.csv (BOM, ;)")
check(c.get("/api/reports/attestation", headers=H_op).json()["rows"][0]["full_name"] == op["full_name"], "employee sees only own report")

# сертификат
my = c.get("/api/attempts/my", headers=H_op).json()
cert = next(a["certificate"] for a in my if a["id"] == att_id)
pdf = c.get(f"/api/certificates/{cert['id']}/pdf", headers=H_op)
check(pdf.content[:4] == b"%PDF", "certificate PDF")
v = c.get(f"/api/certificates/verify/{cert['verify_code']}").json()
check(v["valid"] and v["full_name"] == op["full_name"], "public verify")
check(not c.get("/api/certificates/verify/XXXXXXXXXX").json()["valid"], "verify unknown code → invalid")
check(c.get(f"/api/protocols/attestation?course_id={course_id}", headers=H_m).content[:4] == b"%PDF", "attestation protocol PDF")

# 360
H_op1, _ = login("op01")
tasks = c.get("/api/assessments/my-tasks", headers=H_op1).json()
check(any(t["rater_role"] == "peer" for t in tasks), "op01 has a peer assessment task")
profiles = c.get("/api/assessments", headers=H_mgr).json()
# в seed есть закрытые оценки 180 и 360 — для проверки рекомендаций берём 360
closed = next(a for a in profiles if a["status"] == "closed" and a["kind"] == "360")
prof = c.get(f"/api/assessments/{closed['id']}/profile", headers=H_mgr).json()
check(prof["kind"] == "360" and prof["recommendations"], "closed 360 profile with recommendations")

# импорт
csv_data = "full_name;login;password;role;position;department\nТестов Тест;smoke_user;pw1;сотрудник;Аппаратчик;Склад\n;bad;;employee;;\n"
r = c.post("/api/imports/users?dry_run=true", headers=H_m, files={"file": ("u.csv", csv_data.encode("utf-8-sig"), "text/csv")}).json()
check(r["created"] == 1 and len(r["errors"]) == 1, "import dry-run: 1 create, 1 error")

# загрузка DOCX → PDF
from docx import Document  # noqa: E402

buf = io.BytesIO()
d = Document()
d.add_heading("Проверочный СОП", 0)
d.add_paragraph("Текст документа для конвертации.")
d.save(buf)
f = c.post("/api/files", headers=H_m, files={"file": ("smoke.docx", buf.getvalue())}).json()
t0 = time.time()
while time.time() - t0 < 60:
    info = c.get(f"/api/files/{f['id']}/info", headers=H_m).json()
    if info["conversion_status"] != "processing":
        break
    time.sleep(1)
check(info["conversion_status"] == "ready" and info["offline_mime"] == "application/pdf", f"DOCX → PDF in {time.time() - t0:.1f}s")
print(f"\nALL OK ({ok} checks)")

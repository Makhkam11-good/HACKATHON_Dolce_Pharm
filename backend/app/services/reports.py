"""Отчёты (раздел 10). Каждый отчёт → {columns: [{key,title}], rows: [dict]}; экспорт использует то же."""
import uuid
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import (
    ActivityEvent,
    Certificate,
    Course,
    CourseAssignment,
    CourseMaterial,
    Department,
    Device,
    SyncLog,
    Test,
    TestAttempt,
    User,
)

TZ = ZoneInfo(settings.TZ)
SOURCE_RU = {"online": "сеть (онлайн)", "sync": "сеть (после офлайна)", "qr": "QR"}
STATUS_RU = {"passed": "сдал", "failed": "не сдал", "pending_review": "на проверке", "not_started": "не начат", "in_progress": "в процессе"}


class Filters:
    def __init__(self, date_from: date | None = None, date_to: date | None = None, department_id: uuid.UUID | None = None,
                 user_id: uuid.UUID | None = None, course_id: uuid.UUID | None = None):
        self.date_from, self.date_to = date_from, date_to
        self.department_id, self.user_id, self.course_id = department_id, user_id, course_id

    def dt_from(self):
        return datetime.combine(self.date_from, time.min, TZ) if self.date_from else None

    def dt_to(self):
        return datetime.combine(self.date_to + timedelta(days=1), time.min, TZ) if self.date_to else None


def fmt_dt(d: datetime | None) -> str:
    return d.astimezone(TZ).strftime("%d.%m.%Y %H:%M:%S") if d else ""


def fmt_dur(ms: int | float | None) -> str:
    s = int((ms or 0) // 1000)
    return f"{s // 3600:02d}:{s % 3600 // 60:02d}:{s % 60:02d}"


def scoped_users(db: Session, viewer: User, f: Filters) -> list[User]:
    q = select(User).where(User.is_active.is_(True))
    if viewer.role == "employee":
        q = q.where(User.id == viewer.id)
    elif viewer.role == "manager":
        q = q.where(User.department_id == viewer.department_id)
    if f.department_id:
        q = q.where(User.department_id == f.department_id)
    if f.user_id:
        q = q.where(User.id == f.user_id)
    return list(db.scalars(q.order_by(User.full_name)).unique())


def _cols(*pairs):
    return [{"key": k, "title": t} for k, t in pairs]


def report_sessions(db: Session, viewer: User, f: Filters) -> dict:
    users = {u.id: u for u in scoped_users(db, viewer, f)}
    q = select(ActivityEvent).where(ActivityEvent.type.in_(["session_start", "session_end", "material_interval", "test_finish"]),
                                    ActivityEvent.user_id.in_(list(users) or [uuid.uuid4()]))
    if f.dt_from():
        q = q.where(ActivityEvent.started_at >= f.dt_from())
    if f.dt_to():
        q = q.where(ActivityEvent.started_at < f.dt_to())
    events = list(db.scalars(q.order_by(ActivityEvent.started_at)))
    devices = {d.id: d.name for d in db.scalars(select(Device))}
    ends = {}
    last_activity = defaultdict(list)
    for e in events:
        if e.type == "session_end":
            ends[(e.user_id, e.device_id, e.started_at_client)] = e
        elif e.type in ("material_interval", "test_finish"):
            last_activity[(e.user_id, e.device_id)].append(e)
    rows = []
    for e in events:
        if e.type != "session_start":
            continue
        u = users[e.user_id]
        end = ends.get((e.user_id, e.device_id, e.started_at_client))
        if end:
            logout, dur, note = end.ended_at, end.duration_ms or int((end.ended_at - e.started_at).total_seconds() * 1000), ""
        else:
            acts = [a for a in last_activity[(e.user_id, e.device_id)] if a.started_at >= e.started_at and a.ended_at]
            logout = max((a.ended_at for a in acts), default=None)
            dur = int((logout - e.started_at).total_seconds() * 1000) if logout else 0
            note = " (по последней активности)" if logout else " (сессия открыта)"
        rows.append({
            "full_name": u.full_name, "department": u.department.name if u.department else "",
            "device": devices.get(e.device_id, ""), "login_at": fmt_dt(e.started_at),
            "logout_at": fmt_dt(logout) + note, "duration": fmt_dur(dur), "duration_ms": dur,
            "source": SOURCE_RU.get(e.source, e.source), "synced_at": fmt_dt(e.synced_at),
        })
    rows.reverse()
    return {"columns": _cols(("full_name", "ФИО"), ("department", "Подразделение"), ("device", "Устройство"),
                             ("login_at", "Вход"), ("logout_at", "Выход"), ("duration", "Длительность"),
                             ("source", "Источник"), ("synced_at", "Синхронизировано")), "rows": rows}


def report_materials_time(db: Session, viewer: User, f: Filters) -> dict:
    users = {u.id: u for u in scoped_users(db, viewer, f)}
    q = (select(ActivityEvent.user_id, ActivityEvent.material_id, func.sum(ActivityEvent.duration_ms), func.count(),
                func.min(ActivityEvent.started_at), func.max(ActivityEvent.ended_at), func.max(ActivityEvent.synced_at))
         .where(ActivityEvent.type == "material_interval", ActivityEvent.user_id.in_(list(users) or [uuid.uuid4()]))
         .group_by(ActivityEvent.user_id, ActivityEvent.material_id))
    if f.dt_from():
        q = q.where(ActivityEvent.started_at >= f.dt_from())
    if f.dt_to():
        q = q.where(ActivityEvent.started_at < f.dt_to())
    if f.course_id:
        q = q.where(ActivityEvent.course_id == f.course_id)
    mats = {m.id: m for m in db.scalars(select(CourseMaterial))}
    courses = {c.id: c.title for c in db.scalars(select(Course))}
    rows = []
    for uid, mid, total, cnt, first, last, synced in db.execute(q):
        m = mats.get(mid)
        u = users[uid]
        rows.append({
            "full_name": u.full_name, "department": u.department.name if u.department else "",
            "course": courses.get(m.course_id, "") if m else "", "material": m.title if m else "(удалён)",
            "total": fmt_dur(total), "total_ms": int(total or 0), "intervals": cnt,
            "first_at": fmt_dt(first), "last_at": fmt_dt(last), "synced_at": fmt_dt(synced),
        })
    rows.sort(key=lambda r: (r["full_name"], r["course"], r["material"]))
    return {"columns": _cols(("full_name", "ФИО"), ("department", "Подразделение"), ("course", "Курс"), ("material", "Материал"),
                             ("total", "Время (чч:мм:сс)"), ("intervals", "Интервалов"), ("first_at", "Первое обращение"),
                             ("last_at", "Последнее обращение"), ("synced_at", "Синхронизировано")), "rows": rows}


def attestation_data(db: Session, viewer: User, f: Filters) -> list[dict]:
    users = {u.id: u for u in scoped_users(db, viewer, f)}
    q = select(CourseAssignment).where(CourseAssignment.user_id.in_(list(users) or [uuid.uuid4()]))
    if f.course_id:
        q = q.where(CourseAssignment.course_id == f.course_id)
    out = assignment_rows(db, users, list(db.scalars(q)))
    out.sort(key=lambda r: (r["department"], r["full_name"], r["course"]))
    return out


def assignment_states(db: Session, user: User) -> dict[str, dict]:
    """Текущий статус сотрудника по каждому назначенному курсу: {course_id: строка как в отчёте «Аттестация»}."""
    asgs = list(db.scalars(select(CourseAssignment).where(CourseAssignment.user_id == user.id)))
    return {r["course_id"]: r for r in assignment_rows(db, {user.id: user}, asgs)}


def _counts_after(when: datetime | None, reset_at: datetime | None) -> bool:
    """Попытка/событие входит в текущий цикл обучения (после повторного назначения)."""
    return reset_at is None or (when is not None and when >= reset_at)


def assignment_rows(db: Session, users: dict, assignments: list[CourseAssignment]) -> list[dict]:
    """Статус по назначениям. После «повторного обучения» (reset_at) старые попытки и активность
    остаются в истории, но статус, лучший балл и число попыток считаются только по новому циклу."""
    courses = {c.id: c for c in db.scalars(select(Course))}
    tests = {t.course_id: t for t in db.scalars(select(Test))}
    attempts = defaultdict(list)
    for a in db.scalars(select(TestAttempt).where(TestAttempt.user_id.in_(list(users) or [uuid.uuid4()]))):
        attempts[(a.user_id, a.test_id)].append(a)
    certs = {c.attempt_id: c for c in db.scalars(select(Certificate).where(Certificate.user_id.in_(list(users) or [uuid.uuid4()])))}
    started = {(uid, cid): last for uid, cid, last in db.execute(
        select(ActivityEvent.user_id, ActivityEvent.course_id, func.max(ActivityEvent.started_at))
        .where(ActivityEvent.type == "material_interval", ActivityEvent.user_id.in_(list(users) or [uuid.uuid4()]))
        .group_by(ActivityEvent.user_id, ActivityEvent.course_id))}
    today = datetime.now(TZ).date()
    out = []
    for asg in assignments:
        u, c = users[asg.user_id], courses.get(asg.course_id)
        if not c:
            continue
        t = tests.get(c.id)
        atts = sorted(attempts.get((u.id, t.id), []) if t else [], key=lambda a: a.finished_at or a.created_at)
        atts = [a for a in atts if _counts_after(a.finished_at or a.created_at, asg.reset_at)]
        passed = [a for a in atts if a.status == "passed"]
        if passed:
            status, ref = "passed", max(passed, key=lambda a: a.score)
        elif any(a.status == "pending_review" for a in atts):
            status, ref = "pending_review", next(a for a in atts if a.status == "pending_review")
        elif atts:
            status, ref = "failed", max(atts, key=lambda a: a.score)
        else:
            last = started.get((u.id, c.id))
            status, ref = ("in_progress" if last and _counts_after(last, asg.reset_at) else "not_started"), None
        best = max((float(a.score) for a in atts), default=None)
        cert = certs.get(ref.id) if ref and status == "passed" else None
        overdue = bool(asg.due_date and asg.due_date < today and status != "passed")
        out.append({
            "user_id": str(u.id), "course_id": str(c.id), "full_name": u.full_name, "position": u.position or "",
            "department": u.department.name if u.department else "", "department_id": str(u.department_id) if u.department_id else None,
            "course": c.title, "course_version": ref.course_version if ref else c.version, "attempts": len(atts),
            "best_score": best, "status": status, "status_ru": STATUS_RU[status],
            "date": fmt_dt(ref.finished_at) if ref else "", "certificate": cert.number if cert else "",
            "certificate_id": str(cert.id) if cert else None,
            "due_date": asg.due_date.strftime("%d.%m.%Y") if asg.due_date else "", "overdue": overdue,
            "due_date_iso": asg.due_date.isoformat() if asg.due_date else None,
            "retrained": asg.reset_at is not None,
        })
    return out


def report_attestation(db: Session, viewer: User, f: Filters) -> dict:
    rows = attestation_data(db, viewer, f)
    for r in rows:
        r["best_score_fmt"] = f"{r['best_score']:.1f}" if r["best_score"] is not None else ""
        r["overdue_ru"] = "да" if r["overdue"] else ""
    return {"columns": _cols(("full_name", "ФИО"), ("position", "Должность"), ("department", "Подразделение"), ("course", "Курс"),
                             ("course_version", "Версия"), ("attempts", "Попыток"), ("best_score_fmt", "Лучший балл, %"),
                             ("status_ru", "Статус"), ("date", "Дата"), ("due_date", "Срок"), ("overdue_ru", "Просрочено"),
                             ("certificate", "Сертификат")), "rows": rows}


def report_summary(db: Session, viewer: User, f: Filters) -> dict:
    rows = attestation_data(db, viewer, f)
    mt = report_materials_time(db, viewer, f)["rows"]
    time_by_pair = defaultdict(int)
    for r in mt:
        time_by_pair[(r["full_name"], r["course"])] += r["total_ms"]
    avg_ms = int(sum(time_by_pair.values()) / len(time_by_pair)) if time_by_pair else 0
    by_dept = defaultdict(lambda: {"assigned": 0, "passed": 0, "failed": 0, "pending_review": 0, "overdue": 0})
    for r in rows:
        d = by_dept[r["department"] or "—"]
        d["assigned"] += 1
        if r["status"] in ("passed", "failed", "pending_review"):
            d[r["status"]] += 1
        if r["overdue"]:
            d["overdue"] += 1
    total_ms = sum(r["total_ms"] for r in mt)
    cards = {
        "assigned": len(rows),
        "passed": sum(r["status"] == "passed" for r in rows),
        "failed": sum(r["status"] == "failed" for r in rows),
        "pending_review": sum(r["status"] == "pending_review" for r in rows),
        "overdue": sum(r["overdue"] for r in rows),
        "avg_time_per_course": fmt_dur(avg_ms),
        "avg_time_per_course_ms": avg_ms,
        "total_time": fmt_dur(total_ms),
    }
    table = [{"department": k, **v} for k, v in sorted(by_dept.items())]
    return {"cards": cards, "by_department": table,
            "columns": _cols(("department", "Подразделение"), ("assigned", "Назначено"), ("passed", "Сдано"),
                             ("failed", "Не сдано"), ("pending_review", "На проверке"), ("overdue", "Просрочено")),
            "rows": table}


def report_sync(db: Session, viewer: User, f: Filters) -> dict:
    users = {u.id: u for u in scoped_users(db, viewer, f)}
    q = select(SyncLog).where(SyncLog.user_id.in_(list(users) or [uuid.uuid4()]), SyncLog.items_count > 0)
    if f.dt_from():
        q = q.where(SyncLog.received_at >= f.dt_from())
    if f.dt_to():
        q = q.where(SyncLog.received_at < f.dt_to())
    rows = []
    for s in db.scalars(q.order_by(SyncLog.received_at.desc()).limit(500)):
        u = users[s.user_id]
        rows.append({
            "received_at": fmt_dt(s.received_at), "full_name": u.full_name, "source": SOURCE_RU.get(s.source, s.source),
            "items": s.items_count, "accepted": s.accepted_count, "duplicates": s.duplicates_count, "rejected": s.rejected_count,
            "online_since": fmt_dt(s.online_since),
            "lag": f"{s.lag_ms / 1000:.1f} с" if s.lag_ms is not None else "",
            "lag_ms": s.lag_ms,
            "ok": ("≤ 60 с ✓" if s.lag_ms <= 60000 else "> 60 с") if s.lag_ms is not None else "",
            "max_event_delay": fmt_dur(s.max_event_delay_ms) if s.max_event_delay_ms is not None else "",
        })
    return {"columns": _cols(("received_at", "Получено сервером"), ("full_name", "ФИО"), ("source", "Канал"),
                             ("items", "Элементов"), ("accepted", "Принято"), ("duplicates", "Дубли"), ("rejected", "Отклонено"),
                             ("online_since", "Сеть появилась"), ("lag", "Задержка после появления сети"), ("ok", "Норматив"),
                             ("max_event_delay", "Возраст старейшего события")), "rows": rows}


REPORTS = {
    "sessions": ("Сессии (вход и выход)", report_sessions),
    "materials-time": ("Время по материалам", report_materials_time),
    "attestation": ("Аттестация", report_attestation),
    "summary": ("Сводка по подразделениям", report_summary),
    "sync": ("Синхронизация", report_sync),
}

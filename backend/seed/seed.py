"""Демо-наполнение (раздел 14). Запускается при старте контейнера, если в БД нет пользователей.

python -m seed.seed          — заполнить, если пусто
python -m seed.seed --force  — очистить БД и заполнить заново
"""
import logging
import random
import secrets
import shutil
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, insert, select, text

from app import models  # noqa: F401
from app.config import settings
from app.db import Base, SessionLocal, engine
from app.models import (
    ActivityEvent,
    AnswerOption,
    Assessment,
    AssessmentRater,
    AssessmentResponse,
    Category,
    Certificate,
    Competency,
    Course,
    CourseAssignment,
    CourseMaterial,
    Department,
    Device,
    File,
    LibraryItem,
    Question,
    QrBatch,
    Scenario,
    SyncLog,
    Test,
    TestAttempt,
    User,
    course_competencies,
)
from app.security import hash_password
from app.services.convert import convert_file_record, guess_mime
from app.services.package import new_salt
from app.services.storage import file_dir, rel_path
from app.services.sync_service import save_attempt
from seed import content
from seed.generate_files import LIBRARY_DOCS, generate_all

log = logging.getLogger("seed")
random.seed(2026)

DEPARTMENTS = ["Цех твёрдых лекарственных форм", "Цех стерильных растворов", "Отдел контроля качества", "Склад"]
OPERATORS = [
    ("Ахметов Нурлан Серикович", "Оператор фасовочной линии", 0), ("Иванова Ольга Петровна", "Аппаратчик", 0),
    ("Жумабекова Айгерим Маратовна", "Оператор фасовочной линии", 1), ("Сидоров Алексей Викторович", "Укладчик-упаковщик", 0),
    ("Нурланова Дана Ерлановна", "Лаборант ОКК", 2), ("Касымов Ерлан Бакытович", "Аппаратчик", 1),
    ("Петрова Мария Андреевна", "Оператор фасовочной линии", 1), ("Темирханов Арман Кайратович", "Кладовщик", 3),
    ("Смирнова Елена Игоревна", "Лаборант ОКК", 2), ("Абдрахманов Тимур Асланович", "Укладчик-упаковщик", 0),
    ("Ким Виктория Сергеевна", "Аппаратчик", 0), ("Оспанов Данияр Муратович", "Оператор фасовочной линии", 0),
    ("Козлова Анна Дмитриевна", "Укладчик-упаковщик", 1), ("Сейткали Асель Нуржановна", "Аппаратчик", 1),
    ("Морозов Игорь Олегович", "Кладовщик", 3), ("Бекова Жанар Талгатовна", "Лаборант ОКК", 2),
    ("Волков Денис Сергеевич", "Оператор фасовочной линии", 0), ("Ермекова Камила Азатовна", "Укладчик-упаковщик", 1),
    ("Попов Артём Ильич", "Аппаратчик", 0), ("Утепова Гульмира Бахытжановна", "Кладовщик", 3),
]
COMPETENCIES = [
    ("Соблюдение GMP", "Знание и выполнение требований надлежащей производственной практики"),
    ("Техника безопасности", "Безопасные приёмы работы, применение СИЗ"),
    ("Работа с оборудованием", "Подготовка, эксплуатация и остановка оборудования"),
    ("Документирование", "Своевременное и правильное ведение записей"),
    ("Командная работа", "Взаимодействие с коллегами и мастером"),
    ("Действия в нештатных ситуациях", "Реакция на аварии, разливы, травмы"),
]


def register_file(db, path, convert=True) -> File:
    fid = uuid.uuid4()
    dest = file_dir(fid) / f"original{path.suffix.lower()}"
    shutil.copy(path, dest)
    f = File(id=fid, original_name=path.name, mime=guess_mime(path.name), size_bytes=dest.stat().st_size,
             storage_path=rel_path(dest), conversion_status="processing")
    db.add(f)
    if convert:
        convert_file_record(f)
    db.flush()
    return f


def add_test(db, course: Course, title: str, spec: list, time_limit=15) -> Test:
    t = Test(course_id=course.id, title=title, time_limit_min=time_limit, max_attempts=3, salt=new_salt())
    db.add(t)
    db.flush()
    for qi, row in enumerate(spec, 1):
        # варианты: (type, body, pts, options, None, None, expl); открытый: (type, body, pts, keywords, kmin, expl)
        qtype, body, pts, opts = row[:4]
        kmin, expl = (row[4], row[5]) if qtype == "open" else (row[5], row[6])
        q = Question(test_id=t.id, position=qi, type=qtype, body=body, points=pts, explanation=expl)
        if qtype == "open":
            q.keywords, q.keywords_min = opts, kmin
        db.add(q)
        db.flush()
        if qtype != "open":
            for oi, (otext, correct) in enumerate(opts, 1):
                db.add(AnswerOption(question_id=q.id, position=oi, text=otext,
                                    is_correct=correct if qtype in ("single", "multi") else False,
                                    correct_order=oi if qtype == "order" else None))
    db.flush()
    db.refresh(t)
    return t


def fake_answers(test: Test, skill: float, force_review: bool = False) -> list[dict]:
    out = []
    for q in test.questions:
        good = random.random() < skill
        opts = list(q.options)
        if q.type == "single":
            correct = [o for o in opts if o.is_correct]
            wrong = [o for o in opts if not o.is_correct]
            pick = correct[0] if good or not wrong else random.choice(wrong)
            out.append({"question_id": str(q.id), "selected_option_ids": [str(pick.id)]})
        elif q.type == "multi":
            sel = [o for o in opts if o.is_correct]
            if not good:
                sel = sel[:-1] + [o for o in opts if not o.is_correct][:1]
            out.append({"question_id": str(q.id), "selected_option_ids": [str(o.id) for o in sel]})
        elif q.type == "order":
            order = sorted(opts, key=lambda o: o.correct_order)
            if not good and len(order) > 2:
                order[0], order[2] = order[2], order[0]
            out.append({"question_id": str(q.id), "order_option_ids": [str(o.id) for o in order]})
        else:
            if force_review:
                txt = "Действую по ситуации, как скажут на месте"
            elif good:
                txt = " ".join(q.keywords) + " — так написано в инструкции"
            else:
                txt = "Нужно " + " и ".join(q.keywords)
            out.append({"question_id": str(q.id), "answer_text": txt})
    return out


def seed(force: bool = False) -> None:
    Base.metadata.create_all(engine)
    db = SessionLocal()
    try:
        if db.scalar(select(func.count()).select_from(User)):
            if not force:
                log.info("БД уже заполнена — сид пропущен")
                return
        if force:
            db.close()
            Base.metadata.drop_all(engine)
            Base.metadata.create_all(engine)
            db = SessionLocal()
        t0 = time.time()
        log.info("Генерация демо-файлов…")
        src = generate_all(settings.STORAGE_DIR / "seed_src")

        depts = [Department(name=n) for n in DEPARTMENTS]
        db.add_all(depts)
        db.flush()
        pw = hash_password("demo123")
        admin = User(full_name="Администратор системы", login="admin", password_hash=pw, role="admin", position="Администратор")
        methodist = User(full_name="Баймуханова Сауле Ериковна", login="methodist", password_hash=pw, role="methodist",
                         position="Методист отдела обучения")
        m1 = User(full_name="Мусин Бауыржан Ерикович", login="manager1", password_hash=pw, role="manager",
                  position="Начальник цеха твёрдых лекарственных форм", department_id=depts[0].id)
        m2 = User(full_name="Лебедева Татьяна Викторовна", login="manager2", password_hash=pw, role="manager",
                  position="Начальник цеха стерильных растворов", department_id=depts[1].id)
        db.add_all([admin, methodist, m1, m2])
        db.flush()
        dept_manager = {0: m1.id, 1: m2.id, 2: m2.id, 3: m1.id}
        ops = []
        for i, (name, pos, d) in enumerate(OPERATORS, 1):
            u = User(full_name=name, login=f"op{i:02d}", password_hash=pw, role="employee", position=pos,
                     department_id=depts[d].id, manager_id=dept_manager[d])
            ops.append(u)
        db.add_all(ops)
        db.flush()

        comps = [Competency(name=n, description=d) for n, d in COMPETENCIES]
        db.add_all(comps)
        cat_names = ["Охрана труда", "GMP", "Промышленная безопасность"]
        ccats = {n: Category(name=n, kind="course") for n in cat_names}
        db.add_all(ccats.values())
        lcats = {n: Category(name=n, kind="library") for n in ["Охрана труда", "GMP", "Пожарная безопасность", "Первая помощь"]}
        db.add_all(lcats.values())
        db.flush()
        lcats["Чистые зоны"] = Category(name="Чистые зоны", kind="library", parent_id=lcats["GMP"].id)
        db.add(lcats["Чистые зоны"])
        db.flush()

        log.info("Регистрация и конвертация файлов (LibreOffice, ffmpeg)…")
        f_pdf = register_file(db, src["safety_pdf"])
        f_docx = register_file(db, src["sop_docx"])
        f_xlsx = register_file(db, src["ppe_xlsx"])
        f_pptx = register_file(db, src["spill_pptx"])
        f_video = register_file(db, src["ppe_video"]) if src.get("ppe_video") else None

        def course(title, desc, cat, color, comp_idx):
            c = Course(title=title, description=desc, category_id=ccats[cat].id, author_id=methodist.id, status="published",
                       version=1, pass_score=80, cover_color=color)
            db.add(c)
            db.flush()
            for ci in comp_idx:
                db.execute(insert(course_competencies).values(course_id=c.id, competency_id=comps[ci].id))
            return c

        def mat(c, pos, mtype, title, file=None, url=None, body=None, min_s=0):
            db.add(CourseMaterial(course_id=c.id, position=pos, type=mtype, title=title, file_id=file.id if file else None,
                                  url=url, body_md=body, min_seconds=min_s))

        c1 = course("Охрана труда и техника безопасности в цехе", "Обязательный курс для операторов: требования до, во время и после работы, СИЗ, аварийные ситуации.",
                    "Охрана труда", "#1f6f5c", [1, 2, 5])
        mat(c1, 1, "pdf", "Инструкция по охране труда для оператора", f_pdf, min_s=60)
        pos = 2
        if f_video:
            mat(c1, 2, "video", "Видеоинструктаж: средства индивидуальной защиты", f_video, min_s=20)
            pos = 3
        mat(c1, pos, "text", "Памятка: главное о безопасности", body=content.COURSE1_TEXT, min_s=15)
        mat(c1, pos + 1, "link", "Закон РК о безопасности и охране труда (справочно)", url="https://adilet.zan.kz/")
        c2 = course("GMP: гигиена и переодевание в чистой зоне", "Правила GMP для персонала чистых помещений: переодевание, гигиена, СИЗ, документирование.",
                    "GMP", "#2a7ab0", [0, 3])
        mat(c2, 1, "doc", "СОП: переодевание при входе в чистую зону", f_docx, min_s=45)
        mat(c2, 2, "xls", "Перечень СИЗ по участкам", f_xlsx, min_s=20)
        mat(c2, 3, "text", "Чистая зона: короткие правила", body=content.COURSE2_TEXT, min_s=15)
        c3 = course("Действия при разливе химических веществ", "Алгоритм действий при разливе, СИЗ, первая помощь и тренажёр-ситуация.",
                    "Промышленная безопасность", "#b5562a", [5, 1, 4])
        mat(c3, 1, "ppt", "Презентация: действия при разливе", f_pptx, min_s=40)
        mat(c3, 2, "text", "Разлив вещества: 5 шагов", body=content.COURSE3_TEXT, min_s=15)
        db.flush()
        t1 = add_test(db, c1, "Итоговый тест: охрана труда", content.COURSE1_TEST)
        t2 = add_test(db, c2, "Итоговый тест: GMP", content.COURSE2_TEST)
        t3 = add_test(db, c3, "Итоговый тест: разлив веществ", content.COURSE3_TEST, time_limit=10)
        db.add(Scenario(course_id=c3.id, title="Разлив химического вещества в цехе",
                        description="Мастер смены Айгерим сообщает о разливе. Примите правильные решения.",
                        start_node_id="n1", data=content.SPILL_SCENARIO))
        for c in (c1, c2, c3):
            for u in ops:
                db.add(CourseAssignment(course_id=c.id, user_id=u.id, assigned_by=methodist.id,
                                        due_date=(datetime.now(timezone.utc) + timedelta(days=random.choice([-3, 7, 14, 21]))).date()))
        # библиотека
        for i, (title, cat, tags, _s) in enumerate(LIBRARY_DOCS):
            f = register_file(db, src[f"lib{i}"])
            db.add(LibraryItem(title=title, description=f"Документ библиотеки: {title.lower()}.", category_id=lcats[cat].id,
                               file_id=f.id, tags=tags, allow_offline=True))
        db.add(LibraryItem(title="СОП: переодевание при входе в чистую зону (DOCX)", description="Исходный документ СОП.",
                           category_id=lcats["Чистые зоны"].id, file_id=f_docx.id, tags=["gmp", "сop", "переодевание"]))
        db.flush()

        log.info("История обучения за 14 дней…")
        history(db, ops[2:14], [(c1, t1), (c2, t2), (c3, t3)])
        assessments(db, ops, m1, comps)
        db.commit()
        log.info("Сид завершён за %.1f с", time.time() - t0)
    finally:
        db.close()


def history(db, users, course_tests):
    now = datetime.now(timezone.utc)
    review_left = 2
    for ui, u in enumerate(users):
        dev = Device(user_id=u.id, name=random.choice(["Android · Chrome", "iPhone · Safari", "Android · Samsung Internet"]),
                     secret=secrets.token_bytes(32), offset_known=True, clock_offset_ms=random.randint(-90000, 90000))
        db.add(dev)
        db.flush()
        skill = 0.35 if ui % 4 == 3 else random.uniform(0.6, 0.97)  # каждый 4-й — слабый, не сдаёт
        n_courses = random.choice([1, 2, 2, 3])
        for ci, (c, t) in enumerate(course_tests[:n_courses]):
            day = now - timedelta(days=random.randint(1, 13), hours=random.randint(0, 6))
            start = day.replace(hour=random.randint(3, 9), minute=random.randint(0, 59))  # 08–14 по Алматы
            source = random.choice(["sync", "sync", "qr", "online"])
            synced = start + (timedelta(hours=random.randint(2, 30)) if source == "qr" else timedelta(minutes=random.randint(15, 60)))
            cur = start
            seq = 0

            def ev(etype, s, e=None, dur=0, mat=None):
                nonlocal seq
                seq += 1
                db.add(ActivityEvent(id=uuid.uuid4(), user_id=u.id, device_id=dev.id, course_id=c.id, material_id=mat, type=etype,
                                     client_seq=seq, started_at_client=s - timedelta(milliseconds=dev.clock_offset_ms),
                                     ended_at_client=(e - timedelta(milliseconds=dev.clock_offset_ms)) if e else None,
                                     started_at=s, ended_at=e, duration_ms=dur, source=source, synced_at=synced))

            ev("session_start", cur)
            sess_start = cur
            for m in c.materials:
                if m.type == "link":
                    continue
                for _ in range(random.randint(1, 4)):
                    d = random.randint(25, 240)
                    ev("material_interval", cur, cur + timedelta(seconds=d), d * 1000, m.id)
                    cur += timedelta(seconds=d + random.randint(1, 20))
            attempts = 1 if (skill > 0.8 or skill < 0.4) else random.choice([1, 2])
            for k in range(attempts):
                t_start = cur
                cur += timedelta(minutes=random.randint(4, 12))
                ev("test_start", t_start)
                ev("test_finish", t_start, cur, int((cur - t_start).total_seconds() * 1000))
                force = review_left > 0 and k == attempts - 1 and ci == 0 and ui in (1, 5)
                if force:
                    review_left -= 1
                payload = {"test_id": str(t.id), "course_version": c.version, "started_at": t_start.isoformat(),
                           "finished_at": cur.isoformat(), "answers": fake_answers(t, min(0.99, skill + 0.15 * k), force)}
                _, att = save_attempt(db, u, dev, uuid.uuid4(), payload, source, 0)
                att.synced_at = synced
                cert = db.scalar(select(Certificate).where(Certificate.attempt_id == att.id))
                if cert:
                    cert.issued_at = synced
                if att.status == "passed":
                    break
            # «закрытие» сессии
            ev_end = cur + timedelta(seconds=30)
            seq += 1
            db.add(ActivityEvent(id=uuid.uuid4(), user_id=u.id, device_id=dev.id, type="session_end", client_seq=seq,
                                 started_at_client=sess_start - timedelta(milliseconds=dev.clock_offset_ms),
                                 ended_at_client=ev_end - timedelta(milliseconds=dev.clock_offset_ms), started_at=sess_start,
                                 ended_at=ev_end, duration_ms=int((ev_end - sess_start).total_seconds() * 1000), source=source, synced_at=synced))
            lag = random.randint(2500, 14000) if source != "qr" else None
            db.add(SyncLog(device_id=dev.id, user_id=u.id, source=source, items_count=seq + 1, accepted_count=seq + 1,
                           received_at=synced, online_since=(synced - timedelta(milliseconds=lag)) if lag else None, lag_ms=lag,
                           max_event_delay_ms=int((synced - sess_start).total_seconds() * 1000)))
            if source == "qr":
                db.add(QrBatch(id=secrets.token_hex(4), device_id=dev.id, user_id=u.id, items_count=seq + 1, accepted_count=seq + 1,
                               received_at=synced, result={"accepted_count": seq + 1, "user_name": u.full_name, "stats": {}, "attempts": []}))
            db.flush()


def assessments(db, ops, manager, comps):
    subj = ops[3]  # Сидоров (цех ТЛФ, manager1) — закрытая 360 с ответами
    a = Assessment(subject_id=subj.id, title=f"Оценка 360: {subj.full_name}", period="III квартал 2026", status="closed",
                   created_by=manager.id)
    db.add(a)
    db.flush()
    raters = [(subj.id, "self"), (subj.manager_id, "manager"), (ops[9].id, "peer"), (ops[10].id, "peer")]
    base = {"self": [4, 5, 4, 4, 5, 4], "manager": [4, 4, 3, 3, 4, 2], "peer": [4, 4, 4, 3, 5, 3]}
    for rid, role in raters:
        db.add(AssessmentRater(assessment_id=a.id, rater_id=rid, rater_role=role, completed_at=datetime.now(timezone.utc)))
        for ci, c in enumerate(comps):
            score = max(1, min(5, base[role][ci] + (random.choice([-1, 0, 0]) if role == "peer" else 0)))
            db.add(AssessmentResponse(assessment_id=a.id, rater_id=rid, rater_role=role, competency_id=c.id, score=score,
                                      comment="Иногда теряется при нештатных ситуациях" if (ci == 5 and role == "manager") else None))
    subj2 = ops[11]  # Оспанов — открытая 360, op01 и op10 — коллеги-оценщики
    b = Assessment(subject_id=subj2.id, title=f"Оценка 360: {subj2.full_name}", period="IV квартал 2026", status="open",
                   created_by=manager.id)
    db.add(b)
    db.flush()
    for rid, role in [(subj2.id, "self"), (subj2.manager_id, "manager"), (ops[0].id, "peer"), (ops[9].id, "peer")]:
        db.add(AssessmentRater(assessment_id=b.id, rater_id=rid, rater_role=role))
    db.flush()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    for attempt in range(30):
        try:
            with engine.connect() as conn:
                conn.execute(text("select 1"))
            break
        except Exception:  # noqa: BLE001
            log.info("Ожидание БД…")
            time.sleep(2)
    seed(force="--force" in sys.argv)

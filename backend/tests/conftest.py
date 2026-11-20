"""Тесты, которым нужна БД, работают на отдельной базе lms_test (создаётся автоматически).

Запуск: docker compose run --rm backend pytest -q
"""
import os

BASE_URL = os.environ.get("DATABASE_URL", "postgresql+psycopg://lms:lms@localhost:5432/lms")
TEST_URL = BASE_URL.rsplit("/", 1)[0] + "/lms_test"
os.environ["DATABASE_URL"] = TEST_URL
os.environ.setdefault("STORAGE_DIR", "/tmp/lms_test_storage")

import base64  # noqa: E402
import secrets  # noqa: E402
import uuid  # noqa: E402

import pytest  # noqa: E402


def _ensure_db():
    import psycopg

    admin = BASE_URL.replace("postgresql+psycopg", "postgresql")
    with psycopg.connect(admin, autocommit=True) as c:
        if not c.execute("select 1 from pg_database where datname='lms_test'").fetchone():
            c.execute("create database lms_test")


@pytest.fixture(scope="session")
def engine():
    _ensure_db()
    from app import models  # noqa: F401
    from app.db import Base, engine

    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    return engine


@pytest.fixture()
def db(engine):
    from app.db import SessionLocal

    s = SessionLocal()
    yield s
    s.close()


@pytest.fixture()
def client(engine):
    from fastapi.testclient import TestClient

    from app.main import app

    return TestClient(app)


@pytest.fixture()
def world(db):
    """Курс с тестом, сотрудник, устройство, методист."""
    from app.models import AnswerOption, Course, CourseAssignment, Device, Question, Test, User
    from app.security import create_token, hash_password

    tag = secrets.token_hex(3)
    pw = hash_password("x")
    emp = User(full_name=f"Тестов Т. {tag}", login=f"emp_{tag}", password_hash=pw, role="employee")
    mgr = User(full_name=f"Мастер {tag}", login=f"mgr_{tag}", password_hash=pw, role="manager")
    db.add_all([emp, mgr])
    db.flush()
    course = Course(title=f"Курс {tag}", status="published", pass_score=50)
    db.add(course)
    db.flush()
    test = Test(course_id=course.id, title="Тест", max_attempts=2, salt="s")
    db.add(test)
    db.flush()
    q = Question(test_id=test.id, position=1, type="single", body="?", points=1)
    db.add(q)
    db.flush()
    good = AnswerOption(question_id=q.id, position=1, text="да", is_correct=True)
    bad = AnswerOption(question_id=q.id, position=2, text="нет", is_correct=False)
    db.add_all([good, bad, CourseAssignment(course_id=course.id, user_id=emp.id)])
    secret = secrets.token_bytes(32)
    dev = Device(user_id=emp.id, name="test", secret=secret)
    db.add(dev)
    db.commit()
    return {
        "emp": emp, "mgr": mgr, "course": course, "test": test, "q": q, "good": good, "bad": bad, "device": dev,
        "secret": secret, "secret_b64": base64.b64encode(secret).decode(),
        "h_emp": {"Authorization": f"Bearer {create_token(emp)[0]}"},
        "h_mgr": {"Authorization": f"Bearer {create_token(mgr)[0]}"},
        "uid": lambda: str(uuid.uuid4()),
    }

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings

engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True, pool_size=10, max_overflow=20)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Колонки, добавленные после первого запуска демо: create_all() их в существующие таблицы не добавляет.
_MIGRATIONS = [
    "ALTER TABLE course_assignments ADD COLUMN IF NOT EXISTS reset_at timestamptz",
]


def ensure_schema() -> None:
    Base.metadata.create_all(engine)
    with engine.begin() as conn:
        for sql in _MIGRATIONS:
            conn.execute(text(sql))

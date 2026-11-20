import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, Uuid
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.common import IdMixin, TsMixin


class TestAttempt(Base, IdMixin, TsMixin):
    __test__ = False
    __tablename__ = "test_attempts"
    test_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tests.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    device_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("devices.id", ondelete="SET NULL"), nullable=True)
    course_version: Mapped[int] = mapped_column(Integer, default=1)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    client_score: Mapped[float | None] = mapped_column(Numeric(6, 1), nullable=True)
    score: Mapped[float] = mapped_column(Numeric(6, 1), default=0)
    points_earned: Mapped[float] = mapped_column(Numeric(8, 2), default=0)
    points_max: Mapped[float] = mapped_column(Numeric(8, 2), default=0)
    status: Mapped[str] = mapped_column(String(20))  # passed|failed|pending_review
    source: Mapped[str] = mapped_column(String(10), default="online")  # online|sync|qr
    synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    answers: Mapped[list["AttemptAnswer"]] = relationship(cascade="all, delete-orphan", lazy="selectin")


class AttemptAnswer(Base, IdMixin, TsMixin):
    __tablename__ = "attempt_answers"
    attempt_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("test_attempts.id", ondelete="CASCADE"), index=True)
    question_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("questions.id", ondelete="CASCADE"))
    selected_option_ids: Mapped[list[uuid.UUID] | None] = mapped_column(ARRAY(Uuid), nullable=True)
    order_option_ids: Mapped[list[uuid.UUID] | None] = mapped_column(ARRAY(Uuid), nullable=True)
    answer_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_correct: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    points: Mapped[float] = mapped_column(Numeric(8, 2), default=0)
    needs_review: Mapped[bool] = mapped_column(Boolean, default=False)
    matched_keywords: Mapped[int] = mapped_column(Integer, default=0)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ActivityEvent(Base, TsMixin):
    __tablename__ = "activity_events"
    __table_args__ = (
        Index("ix_events_user_started", "user_id", "started_at"),
        Index("ix_events_material", "material_id"),
        Index("ix_events_course", "course_id"),
    )
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    device_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("devices.id", ondelete="SET NULL"), nullable=True)
    course_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    material_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    type: Mapped[str] = mapped_column(String(30))
    client_seq: Mapped[int] = mapped_column(BigInteger, default=0)
    started_at_client: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ended_at_client: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_ms: Mapped[int] = mapped_column(BigInteger, default=0)
    source: Mapped[str] = mapped_column(String(10), default="online")
    synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class EventAlias(Base):
    """id событий, «поглощённых» при компакции QR-пакета (merged_ids)."""
    __tablename__ = "event_aliases"
    alias_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("activity_events.id", ondelete="CASCADE"))


class QrBatch(Base, TsMixin):
    __tablename__ = "qr_batches"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    device_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("devices.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    items_count: Mapped[int] = mapped_column(Integer, default=0)
    accepted_count: Mapped[int] = mapped_column(Integer, default=0)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    received_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    result: Mapped[dict] = mapped_column(JSONB, default=dict)


class SyncLog(Base, IdMixin, TsMixin):
    """Журнал пачек синхронизации — доказательство метрики «≤ 1 минуты после появления сети»."""
    __tablename__ = "sync_logs"
    device_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("devices.id", ondelete="SET NULL"), nullable=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    source: Mapped[str] = mapped_column(String(10))
    items_count: Mapped[int] = mapped_column(Integer, default=0)
    accepted_count: Mapped[int] = mapped_column(Integer, default=0)
    duplicates_count: Mapped[int] = mapped_column(Integer, default=0)
    rejected_count: Mapped[int] = mapped_column(Integer, default=0)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    online_since: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    lag_ms: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    max_event_delay_ms: Mapped[int | None] = mapped_column(BigInteger, nullable=True)


class Certificate(Base, IdMixin, TsMixin):
    __tablename__ = "certificates"
    attempt_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("test_attempts.id", ondelete="CASCADE"), unique=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    course_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"))
    number: Mapped[str] = mapped_column(String(30), unique=True)
    verify_code: Mapped[str] = mapped_column(String(10), unique=True)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    pdf_path: Mapped[str | None] = mapped_column(Text, nullable=True)

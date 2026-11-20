import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Table, Text, UniqueConstraint, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.common import IdMixin, TsMixin


class Competency(Base, IdMixin, TsMixin):
    __tablename__ = "competencies"
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")


course_competencies = Table(
    "course_competencies",
    Base.metadata,
    Column("course_id", Uuid, ForeignKey("courses.id", ondelete="CASCADE"), primary_key=True),
    Column("competency_id", Uuid, ForeignKey("competencies.id", ondelete="CASCADE"), primary_key=True),
)


class Assessment(Base, IdMixin, TsMixin):
    __tablename__ = "assessments"
    subject_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(300))
    period: Mapped[str] = mapped_column(String(100), default="")
    status: Mapped[str] = mapped_column(String(20), default="open")  # open|closed
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)


class AssessmentRater(Base, IdMixin, TsMixin):
    __tablename__ = "assessment_raters"
    __table_args__ = (UniqueConstraint("assessment_id", "rater_id"),)
    assessment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("assessments.id", ondelete="CASCADE"), index=True)
    rater_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    rater_role: Mapped[str] = mapped_column(String(10))  # self|manager|peer
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AssessmentResponse(Base, IdMixin, TsMixin):
    __tablename__ = "assessment_responses"
    __table_args__ = (UniqueConstraint("assessment_id", "rater_id", "competency_id"),)
    assessment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("assessments.id", ondelete="CASCADE"), index=True)
    rater_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    rater_role: Mapped[str] = mapped_column(String(10))
    competency_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("competencies.id", ondelete="CASCADE"))
    score: Mapped[int] = mapped_column(Integer)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)


class Scenario(Base, IdMixin, TsMixin):
    __tablename__ = "scenarios"
    course_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("courses.id", ondelete="SET NULL"), nullable=True)
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text, default="")
    start_node_id: Mapped[str] = mapped_column(String(100))
    data: Mapped[dict] = mapped_column(JSONB)


class ScenarioRun(Base, TsMixin):
    __tablename__ = "scenario_runs"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    scenario_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scenarios.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    path: Mapped[list] = mapped_column(JSONB, default=list)
    total_score: Mapped[int] = mapped_column(Integer, default=0)
    max_score: Mapped[int] = mapped_column(Integer, default=0)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    source: Mapped[str] = mapped_column(String(10), default="online")
    synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.common import IdMixin, TsMixin


class Test(Base, IdMixin, TsMixin):
    __test__ = False  # не путать pytest
    __tablename__ = "tests"
    course_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), unique=True)
    title: Mapped[str] = mapped_column(String(300))
    time_limit_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_attempts: Mapped[int] = mapped_column(Integer, default=3)
    shuffle_questions: Mapped[bool] = mapped_column(Boolean, default=False)
    salt: Mapped[str] = mapped_column(String(64))

    questions: Mapped[list["Question"]] = relationship(
        order_by="Question.position", cascade="all, delete-orphan", back_populates="test"
    )


class Question(Base, IdMixin, TsMixin):
    __tablename__ = "questions"
    test_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tests.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    type: Mapped[str] = mapped_column(String(20))  # single|multi|open|order
    body: Mapped[str] = mapped_column(Text)
    points: Mapped[float] = mapped_column(Numeric(8, 2), default=1)
    keywords: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
    keywords_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)

    test: Mapped[Test] = relationship(back_populates="questions")
    options: Mapped[list["AnswerOption"]] = relationship(
        order_by="AnswerOption.position", cascade="all, delete-orphan", lazy="selectin"
    )


class AnswerOption(Base, IdMixin, TsMixin):
    __tablename__ = "answer_options"
    question_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("questions.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    text: Mapped[str] = mapped_column(Text)
    is_correct: Mapped[bool] = mapped_column(Boolean, default=False)
    correct_order: Mapped[int | None] = mapped_column(Integer, nullable=True)

import uuid
from datetime import date

from sqlalchemy import BigInteger, Boolean, Date, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.common import IdMixin, TsMixin


class Category(Base, IdMixin, TsMixin):
    __tablename__ = "categories"
    name: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(20))  # course|library
    parent_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)


class File(Base, IdMixin, TsMixin):
    __tablename__ = "files"
    original_name: Mapped[str] = mapped_column(String(300))
    mime: Mapped[str] = mapped_column(String(120))
    size_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    storage_path: Mapped[str] = mapped_column(String(500))
    offline_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    offline_mime: Mapped[str | None] = mapped_column(String(120), nullable=True)
    offline_size_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    conversion_status: Mapped[str] = mapped_column(String(20), default="processing")  # ready|processing|failed
    conversion_error: Mapped[str | None] = mapped_column(Text, nullable=True)


class Course(Base, IdMixin, TsMixin):
    __tablename__ = "courses"
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text, default="")
    category_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)
    author_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft|published
    version: Mapped[int] = mapped_column(Integer, default=1)
    pass_score: Mapped[int] = mapped_column(Integer, default=80)
    cover_color: Mapped[str] = mapped_column(String(20), default="#1f6f5c")

    materials: Mapped[list["CourseMaterial"]] = relationship(
        order_by="CourseMaterial.position", cascade="all, delete-orphan", back_populates="course"
    )


class CourseMaterial(Base, IdMixin, TsMixin):
    __tablename__ = "course_materials"
    course_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    type: Mapped[str] = mapped_column(String(20))  # pdf|video|doc|xls|ppt|link|text
    title: Mapped[str] = mapped_column(String(300))
    file_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("files.id", ondelete="SET NULL"), nullable=True)
    url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    body_md: Mapped[str | None] = mapped_column(Text, nullable=True)
    min_seconds: Mapped[int] = mapped_column(Integer, default=0)

    course: Mapped[Course] = relationship(back_populates="materials")
    file: Mapped[File | None] = relationship(lazy="joined")


class CourseAssignment(Base, IdMixin, TsMixin):
    __tablename__ = "course_assignments"
    __table_args__ = (UniqueConstraint("course_id", "user_id"),)
    course_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    assigned_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)


class LibraryItem(Base, IdMixin, TsMixin):
    __tablename__ = "library_items"
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text, default="")
    category_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)
    file_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("files.id", ondelete="SET NULL"), nullable=True)
    tags: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    allow_offline: Mapped[bool] = mapped_column(Boolean, default=True)

    file: Mapped[File | None] = relationship(lazy="joined")

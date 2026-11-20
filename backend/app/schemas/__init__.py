import uuid
from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, Field

Role = Literal["admin", "methodist", "manager", "employee"]


class LoginIn(BaseModel):
    login: str
    password: str


class DeviceIn(BaseModel):
    name: str = Field(default="Устройство", max_length=200)


class UserIn(BaseModel):
    full_name: str
    login: str
    password: str | None = None
    role: Role = "employee"
    position: str | None = None
    department_id: uuid.UUID | None = None
    manager_id: uuid.UUID | None = None
    lang: Literal["ru", "kk"] = "ru"
    is_active: bool = True


class UserPatch(BaseModel):
    full_name: str | None = None
    password: str | None = None
    role: Role | None = None
    position: str | None = None
    department_id: uuid.UUID | None = None
    manager_id: uuid.UUID | None = None
    lang: Literal["ru", "kk"] | None = None
    is_active: bool | None = None


class NameIn(BaseModel):
    name: str


class CategoryIn(BaseModel):
    name: str
    kind: Literal["course", "library"] = "course"
    parent_id: uuid.UUID | None = None


class CourseIn(BaseModel):
    title: str
    description: str = ""
    category_id: uuid.UUID | None = None
    pass_score: int = Field(default=80, ge=0, le=100)
    cover_color: str = "#1f6f5c"
    competency_ids: list[uuid.UUID] = []


class CoursePatch(BaseModel):
    title: str | None = None
    description: str | None = None
    category_id: uuid.UUID | None = None
    pass_score: int | None = Field(default=None, ge=0, le=100)
    cover_color: str | None = None
    competency_ids: list[uuid.UUID] | None = None


class MaterialIn(BaseModel):
    type: Literal["pdf", "video", "doc", "xls", "ppt", "link", "text"]
    title: str
    file_id: uuid.UUID | None = None
    url: str | None = None
    body_md: str | None = None
    min_seconds: int = Field(default=0, ge=0)


class MaterialPatch(BaseModel):
    title: str | None = None
    file_id: uuid.UUID | None = None
    url: str | None = None
    body_md: str | None = None
    min_seconds: int | None = Field(default=None, ge=0)


class ReorderIn(BaseModel):
    ids: list[uuid.UUID]


class OptionIn(BaseModel):
    id: uuid.UUID | None = None
    text: str
    is_correct: bool = False


class QuestionIn(BaseModel):
    id: uuid.UUID | None = None
    type: Literal["single", "multi", "open", "order"]
    body: str
    points: float = Field(default=1, gt=0)
    keywords: list[str] | None = None
    keywords_min: int | None = None
    explanation: str | None = None
    options: list[OptionIn] = []


class TestIn(BaseModel):
    title: str
    time_limit_min: int | None = Field(default=None, ge=1)
    max_attempts: int = Field(default=3, ge=1, le=20)
    shuffle_questions: bool = False
    questions: list[QuestionIn] = []


class AssignmentIn(BaseModel):
    course_id: uuid.UUID
    user_ids: list[uuid.UUID] | None = None
    department_id: uuid.UUID | None = None
    due_date: date | None = None
    retrain: bool = False  # повторное обучение уже назначенного курса: новый срок, статус «не начат»


class ReviewIn(BaseModel):
    accept: bool


class LibraryIn(BaseModel):
    title: str
    description: str = ""
    category_id: uuid.UUID | None = None
    file_id: uuid.UUID | None = None
    tags: list[str] = []
    allow_offline: bool = True


class LibraryPatch(BaseModel):
    title: str | None = None
    description: str | None = None
    category_id: uuid.UUID | None = None
    file_id: uuid.UUID | None = None
    tags: list[str] | None = None
    allow_offline: bool | None = None


class SyncItem(BaseModel):
    id: str
    kind: str
    payload: dict[str, Any] = {}


class SyncIn(BaseModel):
    device_id: uuid.UUID
    client_now: str
    online_since: str | None = None
    items: list[SyncItem] = Field(default=[], max_length=500)


class QrIn(BaseModel):
    batch_id: str = Field(max_length=32)
    data: str = Field(max_length=2_000_000)


class CompetencyIn(BaseModel):
    name: str
    description: str = ""


class AssessmentIn(BaseModel):
    subject_id: uuid.UUID
    peer_ids: list[uuid.UUID] = []
    period: str = ""
    title: str | None = None


class ResponseItem(BaseModel):
    competency_id: uuid.UUID
    score: int = Field(ge=1, le=5)
    comment: str | None = None
    id: uuid.UUID | None = None


class ResponsesIn(BaseModel):
    responses: list[ResponseItem]


class ScenarioIn(BaseModel):
    title: str
    description: str = ""
    course_id: uuid.UUID | None = None
    data: dict[str, Any]


class AttemptIn(BaseModel):
    id: uuid.UUID
    device_id: uuid.UUID | None = None
    payload: dict[str, Any]

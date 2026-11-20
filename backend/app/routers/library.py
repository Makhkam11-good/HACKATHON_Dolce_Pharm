import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Category, LibraryItem, User
from app.schemas import LibraryIn, LibraryPatch
from app.security import STAFF, api_error, get_current_user, require_role
from app.serializers import library_out

router = APIRouter(tags=["library"])


@router.get("/library")
def list_library(q: str | None = None, category_id: uuid.UUID | None = None, tag: str | None = None,
                 _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    stmt = select(LibraryItem)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(LibraryItem.title.ilike(like), LibraryItem.description.ilike(like),
                              LibraryItem.tags.any(q.lower())))
    if category_id:
        child_ids = [c.id for c in db.scalars(select(Category).where(Category.parent_id == category_id))]
        stmt = stmt.where(LibraryItem.category_id.in_([category_id, *child_ids]))
    if tag:
        stmt = stmt.where(LibraryItem.tags.any(tag))
    return [library_out(i) for i in db.scalars(stmt.order_by(LibraryItem.title)).unique()]


@router.post("/library")
def create_item(body: LibraryIn, _: User = Depends(require_role(*STAFF)), db: Session = Depends(get_db)):
    i = LibraryItem(**{**body.model_dump(), "tags": [t.strip().lower() for t in body.tags if t.strip()]})
    db.add(i)
    db.commit()
    db.refresh(i)
    return library_out(i)


@router.patch("/library/{item_id}")
def patch_item(item_id: uuid.UUID, body: LibraryPatch, _: User = Depends(require_role(*STAFF)), db: Session = Depends(get_db)):
    i = db.get(LibraryItem, item_id)
    if not i:
        raise api_error(404, "not_found", "Документ не найден")
    data = body.model_dump(exclude_unset=True)
    if "tags" in data and data["tags"] is not None:
        data["tags"] = [t.strip().lower() for t in data["tags"] if t.strip()]
    for k, v in data.items():
        setattr(i, k, v)
    db.commit()
    db.refresh(i)
    return library_out(i)


@router.delete("/library/{item_id}")
def delete_item(item_id: uuid.UUID, _: User = Depends(require_role(*STAFF)), db: Session = Depends(get_db)):
    i = db.get(LibraryItem, item_id)
    if i:
        db.delete(i)
        db.commit()
    return {"ok": True}

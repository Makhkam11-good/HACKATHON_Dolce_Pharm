import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, File as UploadField, Request, UploadFile
from fastapi.responses import FileResponse, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models import Category, File, User
from app.schemas import CategoryIn
from app.security import STAFF, api_error, get_current_user, require_role
from app.serializers import file_out
from app.services.convert import guess_mime, kind_of, run_conversion
from app.services.storage import abs_path, rel_path, save_stream

router = APIRouter(tags=["files"])


@router.post("/files")
def upload_file(background: BackgroundTasks, file: UploadFile = UploadField(...),
                _: User = Depends(require_role(*STAFF)), db: Session = Depends(get_db)):
    name = file.filename or "file"
    fid = uuid.uuid4()
    path, size = save_stream(fid, name, file.file)
    if size > settings.MAX_UPLOAD_MB * 1024 * 1024:
        path.unlink(missing_ok=True)
        raise api_error(413, "too_large", f"Файл больше {settings.MAX_UPLOAD_MB} МБ")
    f = File(id=fid, original_name=name, mime=file.content_type or guess_mime(name), size_bytes=size,
             storage_path=rel_path(path), conversion_status="processing")
    db.add(f)
    db.commit()
    background.add_task(run_conversion, fid)
    out = file_out(f)
    out["kind"] = kind_of(name)
    return out


@router.get("/files/{file_id}/info")
def file_info(file_id: uuid.UUID, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    f = db.get(File, file_id)
    if not f:
        raise api_error(404, "not_found", "Файл не найден")
    return file_out(f)


@router.post("/files/{file_id}/retry")
def retry_conversion(file_id: uuid.UUID, background: BackgroundTasks, _: User = Depends(require_role(*STAFF)),
                     db: Session = Depends(get_db)):
    f = db.get(File, file_id)
    if not f:
        raise api_error(404, "not_found", "Файл не найден")
    f.conversion_status, f.conversion_error = "processing", None
    db.commit()
    background.add_task(run_conversion, file_id)
    return file_out(f)


@router.get("/files/{file_id}")
def get_original(file_id: uuid.UUID, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    f = db.get(File, file_id)
    if not f:
        raise api_error(404, "not_found", "Файл не найден")
    return FileResponse(abs_path(f.storage_path), media_type=f.mime, filename=f.original_name)


@router.get("/files/{file_id}/offline")
def get_offline(file_id: uuid.UUID, request: Request, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    f = db.get(File, file_id)
    if not f:
        raise api_error(404, "not_found", "Файл не найден")
    if f.conversion_status != "ready" or not f.offline_path:
        raise api_error(409, "not_ready", "Файл ещё обрабатывается")
    etag = f'"{f.sha256}"'
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"ETag": etag})
    return FileResponse(abs_path(f.offline_path), media_type=f.offline_mime or f.mime, headers={"ETag": etag})


# ---------------------------------------------------------------- категории
@router.get("/categories")
def list_categories(kind: str | None = None, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = select(Category)
    if kind:
        q = q.where(Category.kind == kind)
    return [{"id": str(c.id), "name": c.name, "kind": c.kind, "parent_id": str(c.parent_id) if c.parent_id else None}
            for c in db.scalars(q.order_by(Category.name))]


@router.post("/categories")
def create_category(body: CategoryIn, _: User = Depends(require_role(*STAFF)), db: Session = Depends(get_db)):
    if body.parent_id:
        parent = db.get(Category, body.parent_id)
        if not parent or parent.parent_id:
            raise api_error(422, "bad_parent", "Дерево категорий — не более 2 уровней")
    c = Category(name=body.name, kind=body.kind, parent_id=body.parent_id)
    db.add(c)
    db.commit()
    return {"id": str(c.id), "name": c.name, "kind": c.kind, "parent_id": str(c.parent_id) if c.parent_id else None}


@router.delete("/categories/{cat_id}")
def delete_category(cat_id: uuid.UUID, _: User = Depends(require_role(*STAFF)), db: Session = Depends(get_db)):
    c = db.get(Category, cat_id)
    if c:
        db.delete(c)
        db.commit()
    return {"ok": True}

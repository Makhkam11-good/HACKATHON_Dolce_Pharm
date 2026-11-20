import hashlib
import shutil
import uuid
from pathlib import Path

from app.config import settings


def file_dir(file_id: uuid.UUID) -> Path:
    d = settings.STORAGE_DIR / "files" / str(file_id)
    d.mkdir(parents=True, exist_ok=True)
    return d


def abs_path(rel: str) -> Path:
    return settings.STORAGE_DIR / rel


def rel_path(p: Path) -> str:
    return p.relative_to(settings.STORAGE_DIR).as_posix()


def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def safe_ext(name: str) -> str:
    ext = Path(name).suffix.lower()
    return ext if len(ext) <= 6 and ext[1:].isalnum() else ""


def save_stream(file_id: uuid.UUID, name: str, src) -> tuple[Path, int]:
    dest = file_dir(file_id) / f"original{safe_ext(name)}"
    with open(dest, "wb") as out:
        shutil.copyfileobj(src, out, length=1024 * 1024)
    return dest, dest.stat().st_size

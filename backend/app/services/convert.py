"""Фоновая конвертация: Office → PDF (LibreOffice headless), видео → 720p H.264 (ffmpeg)."""
import logging
import mimetypes
import shutil
import subprocess
import threading
import uuid
from pathlib import Path

from app.db import SessionLocal
from app.models import File
from app.services.storage import abs_path, rel_path, sha256_file

log = logging.getLogger("convert")

OFFICE_EXT = {".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".odt", ".ods", ".odp", ".rtf"}
VIDEO_EXT = {".mp4", ".mov", ".webm", ".m4v", ".avi", ".mkv"}
_lo_lock = threading.Lock()


def kind_of(name: str) -> str:
    ext = Path(name).suffix.lower()
    if ext == ".pdf":
        return "pdf"
    if ext in OFFICE_EXT:
        return "office"
    if ext in VIDEO_EXT:
        return "video"
    return "other"


def material_type_for(name: str) -> str:
    ext = Path(name).suffix.lower()
    if ext in (".doc", ".docx", ".odt", ".rtf"):
        return "doc"
    if ext in (".xls", ".xlsx", ".ods"):
        return "xls"
    if ext in (".ppt", ".pptx", ".odp"):
        return "ppt"
    if ext in VIDEO_EXT:
        return "video"
    return "pdf"


def guess_mime(name: str) -> str:
    return mimetypes.guess_type(name)[0] or "application/octet-stream"


def office_to_pdf(src: Path) -> Path:
    outdir = src.parent / "lo_out"
    outdir.mkdir(exist_ok=True)
    cmd = [
        "soffice", "--headless", "--norestore", "--nolockcheck",
        "-env:UserInstallation=file:///tmp/lo_profile",
        "--convert-to", "pdf", "--outdir", str(outdir), str(src),
    ]
    with _lo_lock:  # LibreOffice не любит параллельные запуски с одним профилем
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=240)
    produced = outdir / (src.stem + ".pdf")
    if r.returncode != 0 or not produced.exists():
        raise RuntimeError(f"LibreOffice: код {r.returncode}. {r.stderr[-500:] or r.stdout[-500:]}")
    dest = src.parent / "offline.pdf"
    shutil.move(str(produced), dest)
    shutil.rmtree(outdir, ignore_errors=True)
    return dest


def video_to_720p(src: Path) -> Path:
    dest = src.parent / "offline.mp4"
    cmd = [
        "ffmpeg", "-y", "-i", str(src),
        "-vf", "scale=-2:'trunc(min(720,ih)/2)*2'",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "27", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", str(dest),
    ]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
    if r.returncode != 0 or not dest.exists():
        raise RuntimeError(f"ffmpeg: код {r.returncode}. {r.stderr[-500:]}")
    return dest


def convert_file_record(f: File) -> None:
    """Выполняет конвертацию и обновляет поля объекта (без commit)."""
    src = abs_path(f.storage_path)
    try:
        k = kind_of(f.original_name)
        if k == "office":
            out, mime = office_to_pdf(src), "application/pdf"
        elif k == "video":
            out, mime = video_to_720p(src), "video/mp4"
        else:
            out, mime = src, f.mime
        f.offline_path = rel_path(out)
        f.offline_mime = mime
        f.offline_size_bytes = out.stat().st_size
        f.sha256 = sha256_file(out)
        f.conversion_status = "ready"
        f.conversion_error = None
    except Exception as e:  # noqa: BLE001
        log.exception("conversion failed for %s", f.id)
        f.conversion_status = "failed"
        f.conversion_error = str(e)[:1000]


def run_conversion(file_id: uuid.UUID) -> None:
    db = SessionLocal()
    try:
        f = db.get(File, file_id)
        if not f:
            return
        convert_file_record(f)
        db.commit()
    finally:
        db.close()

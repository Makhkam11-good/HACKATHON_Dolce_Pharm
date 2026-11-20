import os
from pathlib import Path


class Settings:
    DATABASE_URL: str = os.environ.get(
        "DATABASE_URL", "postgresql+psycopg://lms:lms@localhost:5432/lms"
    )
    JWT_SECRET: str = os.environ.get("JWT_SECRET", "dev-secret-change-me")
    JWT_TTL_DAYS: int = int(os.environ.get("JWT_TTL_DAYS", "7"))
    STORAGE_DIR: Path = Path(os.environ.get("STORAGE_DIR", Path(__file__).resolve().parent.parent / "storage"))
    PUBLIC_HOST: str = os.environ.get("PUBLIC_HOST", "localhost")
    # Полный внешний адрес (https://lms.example.kz). Если пуст — берётся из X-Forwarded-Host/Proto запроса.
    PUBLIC_BASE_URL: str = os.environ.get("PUBLIC_BASE_URL", "").strip().rstrip("/")
    SEED_DEMO: bool = os.environ.get("SEED_DEMO", "1") == "1"
    MAX_UPLOAD_MB: int = 300
    FONT_PATH: str = os.environ.get("FONT_PATH", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
    FONT_BOLD_PATH: str = os.environ.get("FONT_BOLD_PATH", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")
    TZ: str = "Asia/Almaty"


settings = Settings()


def public_base_url(request=None) -> str:
    """Внешний адрес для абсолютных ссылок (QR проверки сертификата и т. п.).

    Порядок: PUBLIC_BASE_URL из .env → X-Forwarded-Host/X-Forwarded-Proto (nginx, Cloudflare Tunnel)
    → адрес самого запроса → https://PUBLIC_HOST.
    """
    if settings.PUBLIC_BASE_URL:
        return settings.PUBLIC_BASE_URL
    if request is not None:
        h = request.headers
        host = (h.get("x-forwarded-host") or h.get("host") or "").split(",")[0].strip()
        proto = (h.get("x-forwarded-proto") or request.url.scheme or "https").split(",")[0].strip()
        if host:
            return f"{proto}://{host}"
    return f"https://{settings.PUBLIC_HOST}"
settings.STORAGE_DIR.mkdir(parents=True, exist_ok=True)

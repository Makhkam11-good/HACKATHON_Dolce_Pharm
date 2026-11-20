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
    SEED_DEMO: bool = os.environ.get("SEED_DEMO", "1") == "1"
    MAX_UPLOAD_MB: int = 300
    FONT_PATH: str = os.environ.get("FONT_PATH", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
    FONT_BOLD_PATH: str = os.environ.get("FONT_BOLD_PATH", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")
    TZ: str = "Asia/Almaty"


settings = Settings()
settings.STORAGE_DIR.mkdir(parents=True, exist_ok=True)

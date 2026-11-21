"""Сертификаты (выдача + PDF) и протокол аттестации (раздел 13)."""
import io
import os
import secrets
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from reportlab.graphics import renderPDF
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader, simpleSplit
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Image as RLImage
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import func, select
from xml.sax.saxutils import escape
from sqlalchemy.orm import Session

from app.config import public_base_url, settings
from app.models import Certificate, Course, TestAttempt, User

CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # без 0/O/1/I
DEMO_NOTE = "Демо-версия. Все данные синтетические и не содержат реальных персональных данных."
_fonts = None


def fonts() -> tuple[str, str]:
    global _fonts
    if _fonts is None:
        if os.path.exists(settings.FONT_PATH):
            pdfmetrics.registerFont(TTFont("DejaVu", settings.FONT_PATH))
            bold = settings.FONT_BOLD_PATH if os.path.exists(settings.FONT_BOLD_PATH) else settings.FONT_PATH
            pdfmetrics.registerFont(TTFont("DejaVu-Bold", bold))
            _fonts = ("DejaVu", "DejaVu-Bold")
        else:  # локальный запуск без шрифта — кириллица не отрисуется, но код не падает
            _fonts = ("Helvetica", "Helvetica-Bold")
    return _fonts


def local_dt(dt: datetime | None) -> str:
    if not dt:
        return ""
    return dt.astimezone(ZoneInfo(settings.TZ)).strftime("%d.%m.%Y %H:%M")


def issue_certificate(db: Session, attempt: TestAttempt, course: Course) -> Certificate:
    existing = db.scalar(select(Certificate).where(Certificate.attempt_id == attempt.id))
    if existing:
        return existing
    now = datetime.now(timezone.utc)
    year = now.year
    prefix = f"DP-{year}-"
    last = db.scalar(select(func.max(Certificate.number)).where(Certificate.number.like(prefix + "%")))
    seq = int(last.split("-")[-1]) + 1 if last else 1
    code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(10))
    cert = Certificate(
        attempt_id=attempt.id, user_id=attempt.user_id, course_id=course.id,
        number=f"{prefix}{seq:06d}", verify_code=code, issued_at=now,
    )
    db.add(cert)
    db.flush()
    return cert


def _qr(data: str, size: float) -> Drawing:
    w = QrCodeWidget(data, barLevel="M")
    b = w.getBounds()
    bw, bh = b[2] - b[0], b[3] - b[1]
    d = Drawing(size, size, transform=[size / bw, 0, 0, size / bh, 0, 0])
    d.add(w)
    return d


# ---------------------------------------------------------------- фирменный стиль (как во frontend/tailwind.config.js)
PRIMARY = colors.HexColor("#4F007D")   # brand-600
BRAND_50 = colors.HexColor("#F5EEF9")  # brand-50
BRAND_100 = colors.HexColor("#EADCF2")
ACCENT = colors.HexColor("#6839CC")
CROSS_RED = colors.HexColor("#D42E12")  # крестик из логотипа (замер по пикселям logo.png)
INK = colors.HexColor("#201E1E")
TEXT = colors.HexColor("#2B2730")
TEXT_2 = colors.HexColor("#5C5566")
GRID = colors.HexColor("#E5E2E9")
OK = colors.HexColor("#1B7D45")
WARN = colors.HexColor("#9A5B00")
ERR = colors.HexColor("#C62828")
NEUTRAL = colors.HexColor("#555555")

BRAND_DIR = Path(__file__).resolve().parent.parent / "assets" / "brand"
_logo_cache: dict[str, ImageReader | None] = {}


def _logo() -> ImageReader | None:
    """Логотип DOLCE-PHARM; нет файла — None (документ без логотипа, но без ошибки)."""
    if "logo" not in _logo_cache:
        path = BRAND_DIR / "logo.png"
        try:
            _logo_cache["logo"] = ImageReader(str(path)) if path.exists() else None
        except Exception:  # noqa: BLE001 — битый файл не должен ломать выдачу сертификата
            _logo_cache["logo"] = None
    return _logo_cache["logo"]


def _watermark() -> ImageReader | None:
    """Птенец из maskable-512.png полупрозрачным водяным знаком (~7%): белый фон → прозрачный."""
    if "wm" not in _logo_cache:
        path = BRAND_DIR / "maskable-512.png"
        try:
            from PIL import Image  # Pillow приходит вместе с reportlab
            im = Image.open(path).convert("RGB")
            alpha = im.convert("L").point(lambda v: int((255 - v) * 0.07))
            rgba = im.copy()
            rgba.putalpha(alpha)
            rgba = rgba.crop(alpha.point(lambda v: 255 if v > 2 else 0).getbbox() or (0, 0, im.width, im.height))
            out = io.BytesIO()
            rgba.save(out, "PNG")
            out.seek(0)
            _logo_cache["wm"] = ImageReader(out)
        except Exception:  # noqa: BLE001
            _logo_cache["wm"] = None
    return _logo_cache["wm"]


def _fit(text: str, font: str, size: float, max_w: float, min_size: float) -> float:
    """Размер шрифта, при котором строка помещается в max_w (не меньше min_size)."""
    while size > min_size and pdfmetrics.stringWidth(text, font, size) > max_w:
        size -= 0.5
    return size


def _score(v) -> str:
    s = f"{float(v):.1f}".rstrip("0").rstrip(".")
    return s.replace(".", ",")


def _red_cross(c: canvas.Canvas, x: float, y: float, s: float) -> None:
    """Маленький красный крестик — декор в цвет логотипа."""
    c.setFillColor(CROSS_RED)
    c.rect(x - s / 2, y - s / 6, s, s / 3, stroke=0, fill=1)
    c.rect(x - s / 6, y - s / 2, s / 3, s, stroke=0, fill=1)


def certificate_pdf(db: Session, cert: Certificate, base_url: str | None = None) -> bytes:
    verify_url = f"{base_url or public_base_url()}/verify/{cert.verify_code}"
    regular, bold = fonts()
    user = db.get(User, cert.user_id)
    course = db.get(Course, cert.course_id)
    attempt = db.get(TestAttempt, cert.attempt_id)
    buf = io.BytesIO()
    W, H = landscape(A4)
    c = canvas.Canvas(buf, pagesize=(W, H))
    c.setTitle(f"Сертификат {cert.number}")
    cx = W / 2

    # рамки: внешняя — primary, внутренняя — тонкая светлая
    c.setStrokeColor(PRIMARY)
    c.setLineWidth(3)
    c.roundRect(10 * mm, 10 * mm, W - 20 * mm, H - 20 * mm, 4 * mm, stroke=1, fill=0)
    c.setStrokeColor(BRAND_100)
    c.setLineWidth(1.2)
    c.roundRect(14 * mm, 14 * mm, W - 28 * mm, H - 28 * mm, 3 * mm, stroke=1, fill=0)
    for x, y in ((14 * mm, 14 * mm), (W - 14 * mm, 14 * mm), (14 * mm, H - 14 * mm), (W - 14 * mm, H - 14 * mm)):
        _red_cross(c, x, y, 3.2 * mm)

    # водяной знак — под текстом
    wm = _watermark()
    if wm:
        iw, ih = wm.getSize()
        ww = 150 * mm
        wh = ww * ih / iw
        c.drawImage(wm, cx - ww / 2, H / 2 - wh / 2 - 6 * mm, ww, wh, mask="auto")

    y = H - 20 * mm
    logo = _logo()
    if logo:
        iw, ih = logo.getSize()
        lw = 70 * mm
        lh = lw * ih / iw
        c.drawImage(logo, cx - lw / 2, y - lh, lw, lh, mask="auto")
        y -= lh + 6 * mm
    else:
        c.setFillColor(PRIMARY)
        c.setFont(bold, 18)
        c.drawCentredString(cx, y - 8 * mm, "DOLCE PHARM")
        y -= 14 * mm

    # «Учебный центр» с декоративными линиями accent
    c.setFillColor(TEXT_2)
    c.setFont(bold, 11)
    label = "УЧЕБНЫЙ ЦЕНТР"
    lw_ = pdfmetrics.stringWidth(label, bold, 11)
    c.drawCentredString(cx, y, label)
    c.setStrokeColor(ACCENT)
    c.setLineWidth(1)
    c.line(cx - lw_ / 2 - 26 * mm, y + 1.3 * mm, cx - lw_ / 2 - 4 * mm, y + 1.3 * mm)
    c.line(cx + lw_ / 2 + 4 * mm, y + 1.3 * mm, cx + lw_ / 2 + 26 * mm, y + 1.3 * mm)
    y -= 13 * mm

    c.setFillColor(PRIMARY)
    title = "Сертификат о прохождении обучения"
    c.setFont(bold, _fit(title, bold, 28, W - 60 * mm, 20))
    c.drawCentredString(cx, y, title)
    y -= 11 * mm

    c.setFillColor(TEXT)
    c.setFont(regular, 12.5)
    c.drawCentredString(cx, y, "Настоящим подтверждается, что")
    y -= 11 * mm

    # ФИО: крупно, при необходимости уменьшаем или переносим
    max_w = W - 70 * mm
    c.setFillColor(INK)
    size = _fit(user.full_name, bold, 24, max_w, 17)
    name_lines = simpleSplit(user.full_name, bold, size, max_w)
    c.setFont(bold, size)
    for ln in name_lines[:2]:
        c.drawCentredString(cx, y, ln)
        y -= size * 0.42 * mm
    y -= 1.5 * mm

    dept = user.department.name if user.department else ""
    pos_line = ", ".join(x for x in [user.position or "", dept] if x)
    if pos_line:
        c.setFillColor(TEXT_2)
        c.setFont(regular, _fit(pos_line, regular, 12, max_w, 9))
        c.drawCentredString(cx, y, pos_line)
        y -= 9 * mm

    c.setFillColor(TEXT)
    c.setFont(regular, 12.5)
    c.drawCentredString(cx, y, "успешно прошёл(а) обучение и аттестацию по программе")
    y -= 5 * mm

    # название курса на светлой плашке, до двух строк
    plate_w = W - 80 * mm
    csize = 17
    course_text = f"«{course.title}»"
    lines = simpleSplit(course_text, bold, csize, plate_w - 12 * mm)
    while len(lines) > 2 and csize > 12:
        csize -= 0.5
        lines = simpleSplit(course_text, bold, csize, plate_w - 12 * mm)
    lines = lines[:2]
    lead = csize * 0.45 * mm
    plate_h = len(lines) * lead + 7 * mm
    c.setFillColor(BRAND_50)
    c.setStrokeColor(BRAND_100)
    c.setLineWidth(0.8)
    c.roundRect(cx - plate_w / 2, y - plate_h, plate_w, plate_h, 3 * mm, stroke=1, fill=1)
    c.setFillColor(PRIMARY)
    c.setFont(bold, csize)
    ty = y - 3.5 * mm - csize * 0.30 * mm
    for ln in lines:
        c.drawCentredString(cx, ty, ln)
        ty -= lead
    y -= plate_h + 9 * mm

    c.setFillColor(INK)
    c.setFont(bold, 13)
    issued = cert.issued_at.astimezone(ZoneInfo(settings.TZ)).strftime("%d.%m.%Y") if cert.issued_at else ""
    c.drawCentredString(cx, y, f"Результат: {_score(attempt.score)}% · Дата проверки знаний: {issued}")

    # ---- нижний ряд: № и код | подпись и М.П. | QR
    base = 22 * mm
    left = 22 * mm
    c.setFillColor(PRIMARY)
    c.setFont(bold, 12)
    c.drawString(left, base + 21 * mm, f"№ {cert.number}")
    c.setFillColor(TEXT)
    c.setFont(regular, 10)
    c.drawString(left, base + 15 * mm, f"Код проверки: {cert.verify_code}")
    c.setFillColor(TEXT_2)
    c.setFont(regular, 8.5)
    c.drawString(left, base + 10 * mm, f"Версия курса: {attempt.course_version}")
    url_size = _fit(verify_url, regular, 8.5, 82 * mm, 6)
    c.setFont(regular, url_size)
    c.drawString(left, base + 5.5 * mm, verify_url)

    sx = cx - 6 * mm
    c.setFillColor(TEXT)
    c.setFont(regular, 10.5)
    c.drawCentredString(sx, base + 18 * mm, "Руководитель учебного центра")
    c.setStrokeColor(TEXT_2)
    c.setLineWidth(0.8)
    c.line(sx - 32 * mm, base + 8 * mm, sx + 32 * mm, base + 8 * mm)
    c.setFont(regular, 8)
    c.setFillColor(TEXT_2)
    c.drawCentredString(sx, base + 4 * mm, "подпись / расшифровка")
    mx, my = sx + 50 * mm, base + 11 * mm
    c.setDash(2, 2)
    c.setStrokeColor(ACCENT)
    c.circle(mx, my, 11 * mm, stroke=1, fill=0)
    c.setDash()
    c.setFillColor(ACCENT)
    c.setFont(bold, 10)
    c.drawCentredString(mx, my - 1.5 * mm, "М.П.")

    qr = 30 * mm
    qx = W - 22 * mm - qr
    renderPDF.draw(_qr(verify_url, qr), c, qx, base - 2 * mm)
    c.setFillColor(TEXT_2)
    c.setFont(regular, 7.5)
    c.drawCentredString(qx + qr / 2, base - 5 * mm, "Проверить подлинность")

    c.setFillColor(TEXT_2)
    c.setFont(regular, 7.5)
    c.drawCentredString(cx, 15.5 * mm, DEMO_NOTE)
    c.showPage()
    c.save()
    return buf.getvalue()


def _hyphen_wrap(text: str, font: str, size: float, width: float) -> str:
    """Двойная фамилия, не влезающая в колонку, переносится по дефису, а не посреди слова."""
    words = []
    for w in escape(text).split(" "):
        if "-" in w and pdfmetrics.stringWidth(w, font, size) > width:
            w = "-<br/>".join(w.split("-"))
        words.append(w)
    return " ".join(words)


PROTOCOL_RESULT = {  # статусы отчётов (status_ru) → формулировки протокола; на сайте статусы не меняются
    "сдал": ("Аттестован", OK), "не сдал": ("Не аттестован", ERR), "на проверке": ("На проверке", WARN),
}


def protocol_pdf(title: str, course_title: str, department: str, rows: list[list[str]]) -> bytes:
    regular, bold = fonts()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm, topMargin=14 * mm, bottomMargin=18 * mm, title=title)
    h = ParagraphStyle("h", fontName=bold, fontSize=17, leading=21, textColor=PRIMARY, alignment=2)
    meta = ParagraphStyle("m", fontName=regular, fontSize=10, leading=13.5, textColor=TEXT, alignment=2)
    p = ParagraphStyle("p", fontName=regular, fontSize=10.5, leading=14, textColor=TEXT)
    cell = ParagraphStyle("c", fontName=regular, fontSize=9, leading=11, textColor=TEXT)
    head = ParagraphStyle("hd", fontName=bold, fontSize=9, leading=11, textColor=colors.white)

    logo = _logo()
    logo_cell = ""
    if logo:
        iw, ih = logo.getSize()
        lw = 52 * mm
        logo_cell = RLImage(str(BRAND_DIR / "logo.png"), width=lw, height=lw * ih / iw)
    right = [
        Paragraph("Протокол аттестации", h),
        Paragraph(f"Программа: <b>{course_title}</b>", meta),
        Paragraph(f"Подразделение: {department}", meta),
        Paragraph(f"Дата формирования: {local_dt(datetime.now(timezone.utc))}", meta),
    ]
    header = Table([[logo_cell, right]], colWidths=[60 * mm, 120 * mm])
    header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("LINEBELOW", (0, 0), (-1, 0), 1.5, PRIMARY), ("BOTTOMPADDING", (0, 0), (-1, 0), 4 * mm),
    ]))

    data = [[Paragraph(x, head) for x in ["№", "ФИО", "Должность", "Дата проверки знаний", "Балл", "Результат"]]]
    styles = [
        ("BACKGROUND", (0, 0), (-1, 0), PRIMARY),
        ("LINEBELOW", (0, 0), (-1, -1), 0.5, GRID),
        ("BOX", (0, 0), (-1, -1), 0.6, GRID),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    for i, r in enumerate(rows, 1):
        name, position, date_, score, status = (list(r) + [""] * 5)[:5]
        label, color = PROTOCOL_RESULT.get(str(status).strip().lower(), ("Не проходил", NEUTRAL))
        res = ParagraphStyle(f"r{i}", parent=cell, fontName=bold, textColor=color)
        data.append([Paragraph(str(i), cell), Paragraph(_hyphen_wrap(str(name), regular, 9, 58 * mm - 12), cell), Paragraph(str(position), cell),
                     Paragraph(str(date_) or "—", cell), Paragraph(str(score), cell), Paragraph(label, res)])
        if i % 2 == 0:
            styles.append(("BACKGROUND", (0, i), (-1, i), BRAND_50))
    t = Table(data, colWidths=[9 * mm, 58 * mm, 38 * mm, 24 * mm, 15 * mm, 36 * mm], repeatRows=1)
    t.setStyle(TableStyle(styles))

    sign = Table([
        [Paragraph("Председатель комиссии", p), Paragraph("____________________ / ____________________", p)],
        [Paragraph("Члены комиссии", p), Paragraph("____________________ / ____________________", p)],
    ], colWidths=[50 * mm, 130 * mm])
    sign.setStyle(TableStyle([("TOPPADDING", (0, 0), (-1, -1), 7), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))

    def footer(cv: canvas.Canvas, d) -> None:
        cv.saveState()
        cv.setFont(regular, 7.5)
        cv.setFillColor(TEXT_2)
        cv.drawString(15 * mm, 10 * mm, DEMO_NOTE)
        cv.drawRightString(A4[0] - 15 * mm, 10 * mm, f"стр. {d.page}")
        cv.restoreState()

    # подписи не отрываются от последних строк таблицы и не переходят на страницу по одной
    story = [header, Spacer(1, 6 * mm), t, KeepTogether([Spacer(1, 12 * mm), sign])]
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return buf.getvalue()

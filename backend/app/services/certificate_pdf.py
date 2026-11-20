"""Сертификаты (выдача + PDF) и протокол аттестации (раздел 13)."""
import io
import os
import secrets
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from reportlab.graphics import renderPDF
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
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


def certificate_pdf(db: Session, cert: Certificate) -> bytes:
    regular, bold = fonts()
    user = db.get(User, cert.user_id)
    course = db.get(Course, cert.course_id)
    attempt = db.get(TestAttempt, cert.attempt_id)
    buf = io.BytesIO()
    W, H = landscape(A4)
    c = canvas.Canvas(buf, pagesize=(W, H))
    c.setTitle(f"Сертификат {cert.number}")
    teal = colors.HexColor("#1f6f5c")
    c.setStrokeColor(teal)
    c.setLineWidth(4)
    c.rect(12 * mm, 12 * mm, W - 24 * mm, H - 24 * mm)
    c.setLineWidth(1)
    c.rect(16 * mm, 16 * mm, W - 32 * mm, H - 32 * mm)
    c.setFillColor(teal)
    c.setFont(bold, 14)
    c.drawCentredString(W / 2, H - 34 * mm, "DOLCE PHARM · УЧЕБНЫЙ ЦЕНТР")
    c.setFont(bold, 30)
    c.drawCentredString(W / 2, H - 52 * mm, "Сертификат о прохождении обучения")
    c.setFillColor(colors.black)
    c.setFont(regular, 13)
    c.drawCentredString(W / 2, H - 66 * mm, "Настоящим подтверждается, что")
    c.setFont(bold, 24)
    c.drawCentredString(W / 2, H - 80 * mm, user.full_name)
    c.setFont(regular, 13)
    dept = user.department.name if user.department else ""
    c.drawCentredString(W / 2, H - 89 * mm, ", ".join(x for x in [user.position or "", dept] if x))
    c.drawCentredString(W / 2, H - 102 * mm, "успешно прошёл(а) обучение и аттестацию по курсу")
    c.setFont(bold, 17)
    c.drawCentredString(W / 2, H - 113 * mm, f"«{course.title}»")
    c.setFont(regular, 12)
    c.drawCentredString(
        W / 2, H - 124 * mm,
        f"Версия курса: {attempt.course_version} · Результат: {float(attempt.score):.1f}% · Дата: {local_dt(cert.issued_at)}",
    )
    c.setFont(bold, 12)
    c.drawString(26 * mm, 40 * mm, f"№ {cert.number}")
    c.setFont(regular, 10)
    c.drawString(26 * mm, 34 * mm, f"Код проверки: {cert.verify_code}")
    c.drawString(26 * mm, 28 * mm, f"Проверить: https://{settings.PUBLIC_HOST}/verify/{cert.verify_code}")
    c.drawString(W / 2 - 10 * mm, 40 * mm, "Руководитель учебного центра  ____________________")
    renderPDF.draw(_qr(f"https://{settings.PUBLIC_HOST}/verify/{cert.verify_code}", 32 * mm), c, W - 56 * mm, 22 * mm)
    c.setFillColor(colors.HexColor("#b42318"))
    c.setFont(regular, 9)
    c.drawCentredString(W / 2, 19 * mm, DEMO_NOTE)
    c.showPage()
    c.save()
    return buf.getvalue()


def protocol_pdf(title: str, course_title: str, department: str, rows: list[list[str]]) -> bytes:
    regular, bold = fonts()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm, topMargin=15 * mm, bottomMargin=15 * mm, title=title)
    h = ParagraphStyle("h", fontName=bold, fontSize=15, leading=19, spaceAfter=6)
    p = ParagraphStyle("p", fontName=regular, fontSize=10, leading=13)
    cell = ParagraphStyle("c", fontName=regular, fontSize=9, leading=11)
    story = [
        Paragraph("Протокол аттестации", h),
        Paragraph(f"Курс: <b>{course_title}</b>", p),
        Paragraph(f"Подразделение: {department}", p),
        Paragraph(f"Дата формирования: {local_dt(datetime.now(timezone.utc))}", p),
        Spacer(1, 6 * mm),
    ]
    data = [["№", "ФИО", "Должность", "Дата", "Балл", "Результат"]]
    for i, r in enumerate(rows, 1):
        data.append([str(i)] + [Paragraph(str(x), cell) for x in r])
    t = Table(data, colWidths=[9 * mm, 52 * mm, 45 * mm, 28 * mm, 15 * mm, 30 * mm], repeatRows=1)
    t.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), regular),
        ("FONTNAME", (0, 0), (-1, 0), bold),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e6f2ef")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story += [t, Spacer(1, 14 * mm), Paragraph("Председатель комиссии ____________________", p), Spacer(1, 6 * mm),
              Paragraph("Члены комиссии ____________________   ____________________", p), Spacer(1, 10 * mm),
              Paragraph(f"<font color='#b42318'>{DEMO_NOTE}</font>", p)]
    doc.build(story)
    return buf.getvalue()

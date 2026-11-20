"""Выгрузка таблиц в XLSX (openpyxl) и CSV (UTF-8 с BOM, разделитель «;» — открывается в Excel)."""
import csv
import io
from urllib.parse import quote

from fastapi.responses import Response
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def to_xlsx(title: str, columns: list[dict], rows: list[dict]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = title[:31] or "Отчёт"
    ws.append([c["title"] for c in columns])
    for cell in ws[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="1F6F5C")
        cell.alignment = Alignment(wrap_text=True, vertical="center")
    for r in rows:
        ws.append([r.get(c["key"], "") if r.get(c["key"]) is not None else "" for c in columns])
    for i, c in enumerate(columns, 1):
        width = max([len(str(c["title"]))] + [len(str(r.get(c["key"], "") or "")) for r in rows[:300]])
        ws.column_dimensions[get_column_letter(i)].width = min(max(10, width + 2), 60)
    ws.freeze_panes = "A2"
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def to_csv(columns: list[dict], rows: list[dict]) -> bytes:
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";", lineterminator="\r\n")
    w.writerow([c["title"] for c in columns])
    for r in rows:
        w.writerow(["" if r.get(c["key"]) is None else r.get(c["key"]) for c in columns])
    return ("﻿" + buf.getvalue()).encode("utf-8")


def file_response(content: bytes, filename: str, mime: str) -> Response:
    return Response(content, media_type=mime, headers={
        "Content-Disposition": f"attachment; filename=\"export\"; filename*=UTF-8''{quote(filename)}"})


def table_response(fmt: str, base_name: str, columns: list[dict], rows: list[dict]) -> Response:
    if fmt == "csv":
        return file_response(to_csv(columns, rows), f"{base_name}.csv", "text/csv; charset=utf-8")
    return file_response(to_xlsx(base_name, columns, rows), f"{base_name}.xlsx", XLSX_MIME)

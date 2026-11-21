"""Примеры сертификата и протокола для визуальной проверки вёрстки (без БД).

Запуск: docker compose exec backend python -m tests.pdf_samples /tmp
Сертификат — с длинным ФИО и длинным названием курса, протокол — на 15 строк со всеми статусами.
"""
import sys
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace as NS

from app.services.certificate_pdf import certificate_pdf, protocol_pdf

out = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
user = NS(full_name="Константинопольская-Бахытжанова Александра-Мария Сериковна", position="Аппаратчик стерилизации ампул и флаконов",
          department=NS(name="Цех стерильных растворов и инъекционных форм"))
course = NS(title="Действия при аварийном разливе химических веществ и первая помощь пострадавшим на фасовочной линии стерильного цеха")
attempt = NS(score=90.0, course_version=3)


class StubDB:
    def get(self, model, _id):
        return {"User": user, "Course": course, "TestAttempt": attempt}[model.__name__]


cert = NS(user_id=1, course_id=2, attempt_id=3, number="DP-2026-000123", verify_code="K7M2QX9PAB",
          issued_at=datetime(2026, 11, 21, 6, 30, tzinfo=timezone.utc))
(out / "certificate.pdf").write_bytes(certificate_pdf(StubDB(), cert, "https://lms.dolcepharm.local"))

statuses = ["сдал", "не сдал", "на проверке", "не начат", "в процессе"]
rows = []
for i in range(1, 16):
    name = "Константинопольская-Бахытжанова Александра-Мария Сериковна" if i == 3 else f"Сотрудникова{i} Айгуль Маратовна"
    rows.append([name, "Оператор фасовочной линии", "20.11.2026" if i % 4 else "", f"{60 + i * 2.5:.1f}" if i % 4 else "—", statuses[i % 5]])
(out / "protocol.pdf").write_bytes(protocol_pdf("Протокол", course.title, "Цех стерильных растворов", rows))
print("ok", out)

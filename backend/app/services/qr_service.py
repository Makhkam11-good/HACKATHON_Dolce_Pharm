"""Приём QR-пакета (раздел 7.7): HMAC-подпись, распаковка, защита от повтора."""
import base64
import hashlib
import hmac
import json
import uuid
import zlib
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import Course, Device, QrBatch, SyncLog, Test, User
from app.security import api_error
from app.services.sync_service import parse_dt, process_items, Reject

MAX_INFLATED = 512 * 1024


def b64url_decode(s: str) -> bytes:
    s = s.strip()
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def sign(secret: bytes, data: bytes) -> bytes:
    return hmac.new(secret, data, hashlib.sha256).digest()


def ack_string(secret: bytes, batch_id: str, accepted: int) -> str:
    return f"DPACK1|{batch_id}|{accepted}|{b64url(sign(secret, batch_id.encode()))}"


def inflate(raw: bytes) -> bytes:
    d = zlib.decompressobj()
    try:
        out = d.decompress(raw, MAX_INFLATED)
    except zlib.error:
        raise api_error(400, "bad_payload", "Пакет повреждён")
    if d.unconsumed_tail:
        raise api_error(400, "too_large", "Пакет слишком большой")
    return out


def _summary(db: Session, user: User, res: dict) -> dict:
    attempts = []
    for r in res["attempt_results"]:
        test = db.get(Test, uuid.UUID(r["test_id"]))
        course = db.get(Course, test.course_id) if test else None
        attempts.append({**r, "course_title": course.title if course else "", "user_name": user.full_name})
    return {
        "user_name": user.full_name,
        "accepted_count": len(res["accepted"]),
        "duplicates_count": len(res["duplicates"]),
        "rejected": res["rejected"],
        "stats": res["stats"],
        "attempts": attempts,
    }


def receive_qr(db: Session, receiver: User, batch_id: str, data: str) -> dict:
    if "." not in data:
        raise api_error(400, "bad_payload", "Неверный формат пакета")
    payload_b64, sig_b64 = data.rsplit(".", 1)
    try:
        raw = b64url_decode(payload_b64)
        sig = b64url_decode(sig_b64)
    except (ValueError, base64.binascii.Error):
        raise api_error(400, "bad_payload", "Неверная кодировка пакета")
    try:
        packet = json.loads(inflate(raw).decode("utf-8"))
        device = db.get(Device, uuid.UUID(str(packet["device_id"])))
    except (ValueError, KeyError, UnicodeDecodeError):
        raise api_error(400, "bad_payload", "Не удалось прочитать пакет")
    if not device:
        raise api_error(400, "unknown_device", "Устройство не зарегистрировано")
    if not hmac.compare_digest(sign(device.secret, raw), sig):
        raise api_error(400, "bad_signature", "Подпись не совпала — пакет изменён или подделан")
    if str(packet.get("user_id")) != str(device.user_id):
        raise api_error(400, "user_mismatch", "Пакет не принадлежит владельцу устройства")
    if packet.get("batch_id") != batch_id:
        raise api_error(400, "batch_mismatch", "Номер пакета не совпадает")

    prev = db.get(QrBatch, batch_id)
    if prev:
        return {**prev.result, "already_received": True, "batch_id": batch_id,
                "ack": ack_string(device.secret, batch_id, prev.accepted_count)}

    user = db.get(User, device.user_id)
    if not device.offset_known:
        try:
            client_now = parse_dt(packet.get("client_now"))
        except Reject:
            client_now = None
        if client_now:
            # оценка: пакет создан незадолго до показа; лучше, чем ничего
            device.clock_offset_ms = int((datetime.now(timezone.utc) - client_now).total_seconds() * 1000)
            device.offset_known = True
    offset = device.clock_offset_ms or 0

    items = packet.get("items") or []
    res = process_items(db, user, device, items, "qr", offset)
    summary = _summary(db, user, res)
    now = datetime.now(timezone.utc)
    db.add(QrBatch(
        id=batch_id, device_id=device.id, user_id=user.id, items_count=len(items),
        accepted_count=summary["accepted_count"], received_at=now, received_by=receiver.id, result=summary,
    ))
    db.add(SyncLog(
        device_id=device.id, user_id=user.id, source="qr", items_count=len(items),
        accepted_count=len(res["accepted"]), duplicates_count=len(res["duplicates"]),
        rejected_count=len(res["rejected"]), received_at=now, max_event_delay_ms=res["max_event_delay_ms"],
    ))
    device.last_sync_at = now
    db.commit()
    return {**summary, "already_received": False, "batch_id": batch_id,
            "accepted": res["accepted"], "duplicates": res["duplicates"],
            "ack": ack_string(device.secret, batch_id, summary["accepted_count"])}

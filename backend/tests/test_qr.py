import base64
import hashlib
import hmac
import json
import secrets
import uuid
import zlib
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

from app.models import ActivityEvent, QrBatch
from tests.test_sync import attempt, event, iso, push


def b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def make_packet(w, items, batch_id=None):
    batch_id = batch_id or secrets.token_hex(4)
    packet = {"v": 1, "device_id": str(w["device"].id), "user_id": str(w["emp"].id), "batch_id": batch_id,
              "created_at": iso(datetime.now(timezone.utc)), "client_now": iso(datetime.now(timezone.utc)), "items": items}
    raw = zlib.compress(json.dumps(packet, ensure_ascii=False).encode())
    sig = hmac.new(w["secret"], raw, hashlib.sha256).digest()
    return batch_id, f"{b64url(raw)}.{b64url(sig)}"


def send(client, w, batch_id, data):
    return client.post("/api/sync/qr", headers=w["h_mgr"], json={"batch_id": batch_id, "data": data})


def test_valid_packet_accepted(client, db, world):
    items = [event(world), event(world), attempt(world)]
    bid, data = make_packet(world, items)
    r = send(client, world, bid, data)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["accepted_count"] == 3 and not body["already_received"]
    assert body["attempts"][0]["status"] == "passed"
    assert body["ack"].startswith(f"DPACK1|{bid}|3|")
    row = db.get(ActivityEvent, uuid.UUID(items[0]["id"]))
    assert row.source == "qr"


def test_tampered_packet_rejected(client, world):
    bid, data = make_packet(world, [attempt(world, correct=False)])
    payload, sig = data.split(".")
    raw = bytearray(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    raw[-1] ^= 0x01
    forged = f"{b64url(bytes(raw))}.{sig}"
    r = send(client, world, bid, forged)
    assert r.status_code == 400
    assert r.json()["detail"]["code"] in ("bad_signature", "bad_payload")
    # подделка с корректным zlib, но чужим ключом
    w2 = dict(world, secret=secrets.token_bytes(32))
    bid2, data2 = make_packet(w2, [attempt(world)])
    r2 = send(client, world, bid2, data2)
    assert r2.status_code == 400 and r2.json()["detail"]["code"] == "bad_signature"


def test_replay_and_network_after_qr(client, db, world):
    items = [event(world), event(world)]
    bid, data = make_packet(world, items)
    assert send(client, world, bid, data).status_code == 200
    n = db.scalar(select(func.count()).select_from(ActivityEvent))
    again = send(client, world, bid, data).json()
    assert again["already_received"] is True
    assert db.scalar(select(func.count()).select_from(ActivityEvent)) == n
    assert db.scalar(select(func.count()).select_from(QrBatch).where(QrBatch.id == bid)) == 1
    r = push(client, world, items)  # потом появилась сеть — те же события ещё раз
    assert sorted(r["duplicates"]) == sorted(i["id"] for i in items)


def test_compacted_event_aliases(client, db, world):
    start = datetime.now(timezone.utc) - timedelta(minutes=10)
    parts = [event(world, start=start + timedelta(seconds=30 * i), dur=30000) for i in range(3)]
    merged = dict(parts[0])
    merged["payload"] = dict(parts[0]["payload"], duration_ms=90000, ended_at_client=iso(start + timedelta(seconds=90)),
                             merged_ids=[p["id"] for p in parts])
    bid, data = make_packet(world, [merged])
    assert send(client, world, bid, data).json()["accepted_count"] == 1
    r = push(client, world, parts)  # исходные интервалы через сеть
    assert sorted(r["duplicates"]) == sorted(p["id"] for p in parts)
    assert db.get(ActivityEvent, uuid.UUID(parts[0]["id"])).duration_ms == 90000

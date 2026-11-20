/**
 * Сквозной тест QR-канала против запущенного сервера (без камеры):
 * пакет собирается кодом телефона → чанки → приёмник ПК (QrAssembler) → POST /api/sync/qr → отчёт «Синхронизация».
 *
 * Запуск (сервер поднят через docker compose):
 *   E2E_BASE_URL=https://localhost NODE_EXTRA_CA_CERTS=../nginx/certs/rootCA.pem npx vitest run src/offline/qrSync.e2e.test.ts
 * Без E2E_BASE_URL тест пропускается.
 */
import { describe, expect, it } from 'vitest';
import pako from 'pako';
import type { OutboxItem } from './db';
import { b64urlDecode, b64urlEncode, buildPacket } from './qrExport';
import { QrAssembler } from './qrReceiver';

const BASE = process.env.E2E_BASE_URL;
const EMPLOYEE = process.env.E2E_EMPLOYEE || 'op05';

async function call(path: string, opts: { token?: string; body?: unknown } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function login(loginName: string) {
  const r = await call('/api/auth/login', { body: { login: loginName, password: 'demo123' } });
  expect(r.status).toBe(200);
  return { token: r.json.access_token as string, user: r.json.user };
}

describe.skipIf(!BASE)('QR-синхронизация: телефон → чанки → приёмник → сервер', () => {
  it('принимает пакет, данные в отчёте с каналом QR, повтор — already_received, подделка — bad_signature', async () => {
    // --- телефон сотрудника: устройство, курс, офлайн-записи
    const emp = await login(EMPLOYEE);
    const me = (await call('/api/auth/me', { token: emp.token })).json;
    const dev = (await call('/api/devices', { token: emp.token, body: { name: 'e2e-qr' } })).json;
    const state = (await call('/api/sync/state', { token: emp.token })).json;
    const courseId: string = state.assignments[0].course_id;
    const pkg = (await call(`/api/courses/${courseId}/package`, { token: emp.token })).json;
    const materialId: string = pkg.materials[0].id;

    const t0 = Date.now() - 10 * 60_000;
    const iso = (ms: number) => new Date(ms).toISOString();
    const base = { user_id: me.id, course_id: courseId };
    const ev = (seq: number, type: string, start: number, dur: number, extra: Record<string, unknown> = {}): OutboxItem => ({
      id: crypto.randomUUID(), kind: 'event', status: 'pending', createdAt: start, tries: 0, userId: me.id,
      payload: { ...base, ...extra, type, client_seq: seq, started_at_client: iso(start), ended_at_client: iso(start + dur), duration_ms: dur },
    });
    const outbox = [
      ev(1, 'session_start', t0, 0),
      ev(2, 'material_interval', t0 + 1000, 30_000, { material_id: materialId }),
      ev(3, 'material_interval', t0 + 31_000, 30_000, { material_id: materialId }), // 2–4 идут подряд — компакция склеит их в один интервал
      ev(4, 'material_interval', t0 + 61_000, 25_000, { material_id: materialId }),
      ev(5, 'session_end', t0 + 90_000, 0),
    ];
    const { chunks, batchId } = await buildPacket(outbox, dev.device_id, me.id, dev.secret_b64);

    // --- ПК мастера: коды приходят в случайном порядке и с повторами
    const asm = new QrAssembler();
    let full: string | null = null;
    for (const c of [...chunks].reverse().concat(chunks)) {
      const r = asm.add(c);
      if (r.status === 'complete') full = r.full;
    }
    expect(full).not.toBeNull();

    const mgr = await login('methodist');
    const first = await call('/api/sync/qr', { token: mgr.token, body: { batch_id: batchId, data: full } });
    expect(first.status, JSON.stringify(first.json)).toBe(200);
    expect(first.json.already_received).toBe(false);
    expect(first.json.accepted_count).toBe(3); // session_start + склеенный интервал + session_end
    expect(first.json.ack).toMatch(new RegExp(`^DPACK1\\|${batchId}\\|`));

    // --- отчёт «Синхронизация»: запись с каналом QR
    const rep = await call(`/api/reports/sync?user_id=${me.id}`, { token: mgr.token });
    expect(rep.status).toBe(200);
    expect(rep.json.rows.some((r: { source: string; accepted: number }) => r.source === 'QR' && r.accepted === 3)).toBe(true);

    // --- повтор того же пакета: без дублей
    const again = await call('/api/sync/qr', { token: mgr.token, body: { batch_id: batchId, data: full } });
    expect(again.status).toBe(200);
    expect(again.json.already_received).toBe(true);

    // --- подделка: время ×10 при прежней подписи
    const [p, sig] = full!.split('.');
    const packet = JSON.parse(new TextDecoder().decode(pako.inflate(b64urlDecode(p))));
    packet.batch_id = `${batchId.slice(0, 6)}ff`;
    for (const it of packet.items) if (it.kind === 'event') it.payload.duration_ms *= 10;
    const forged = `${b64urlEncode(pako.deflate(new TextEncoder().encode(JSON.stringify(packet))))}.${sig}`;
    const bad = await call('/api/sync/qr', { token: mgr.token, body: { batch_id: packet.batch_id, data: forged } });
    expect(bad.status).toBe(400);
    expect(bad.json.detail.code).toBe('bad_signature');
    expect(bad.json.detail.message).toMatch(/Подпись не совпала/);

    // --- сотрудник не может сам принимать QR-пакеты
    const denied = await call('/api/sync/qr', { token: emp.token, body: { batch_id: batchId, data: full } });
    expect(denied.status).toBe(403);
  });
});

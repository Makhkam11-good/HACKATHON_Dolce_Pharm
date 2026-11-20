/**
 * Синхронизация outbox → POST /api/sync (раздел 7.5).
 * Триггеры: online, старт/возврат в приложение, таймер 15 с при наличии pending, 2 с после нового элемента.
 */
import { api, ApiError } from '../api/client';
import type { SyncState } from '../types';
import { db, setMeta, getMeta } from './db';
import { getDevice } from './device';
import { checkOnline, getOnlineSince, subscribeNetwork } from './network';
import { OUTBOX_EVENT } from './outbox';
import { currentUserId } from './session';

export type SyncPhase = 'offline' | 'syncing' | 'idle' | 'error';
export interface SyncInfo { phase: SyncPhase; lastSyncAt: number | null; lastError: string | null }

let info: SyncInfo = { phase: 'idle', lastSyncAt: null, lastError: null };
const listeners = new Set<(i: SyncInfo) => void>();
let running = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let backoff = 0;
let started = false;

function setInfo(p: Partial<SyncInfo>) {
  info = { ...info, ...p };
  listeners.forEach((l) => l(info));
}

export function getSyncInfo() {
  return info;
}

export function subscribeSync(l: (i: SyncInfo) => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function scheduleSync(ms: number) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), ms);
}

interface SyncResponse {
  accepted: string[];
  duplicates: string[];
  rejected: { id: string; reason: string }[];
  server_now: string;
  attempt_results: { id: string; score: number; status: string; certificate_number: string | null }[];
}

export async function syncNow(): Promise<boolean> {
  const userId = currentUserId();
  if (!userId || running) return false;
  running = true;
  try {
    if (!(await checkOnline())) {
      setInfo({ phase: 'offline' });
      return false;
    }
    const device = await getDevice(userId);
    if (!device) return false;
    setInfo({ phase: 'syncing' });
    for (let round = 0; round < 50; round++) {
      const batch = (await db.outbox.where('userId').equals(userId).filter((i) => i.status === 'pending' || i.status === 'sent_qr').sortBy('createdAt')).slice(0, 200);
      if (!batch.length) break;
      const onlineSince = getOnlineSince();
      const res = await api<SyncResponse>('/api/sync', {
        body: {
          device_id: device.deviceId,
          client_now: new Date().toISOString(),
          online_since: onlineSince ? new Date(onlineSince).toISOString() : null,
          items: batch.map((i) => ({ id: i.id, kind: i.kind, payload: i.payload })),
        },
        timeout: 30000,
      });
      const ok = new Set([...res.accepted, ...res.duplicates]);
      const rej = new Map(res.rejected.map((r) => [r.id, r.reason]));
      await db.transaction('rw', db.outbox, db.attempts, async () => {
        for (const item of batch) {
          if (ok.has(item.id)) await db.outbox.update(item.id, { status: 'sent' });
          else if (rej.has(item.id)) await db.outbox.update(item.id, { status: 'rejected', reason: rej.get(item.id) });
        }
        for (const r of res.attempt_results) {
          await db.attempts.update(r.id, { serverScore: r.score, serverStatus: r.status, certificateNumber: r.certificate_number });
        }
      });
      if (batch.length < 200) break;
    }
    await pullState(userId);
    backoff = 0;
    setInfo({ phase: 'idle', lastSyncAt: Date.now(), lastError: null });
    await setMeta(`lastSyncAt:${userId}`, Date.now());
    return true;
  } catch (e) {
    const offline = !(e instanceof ApiError);
    backoff = Math.min(60000, backoff ? backoff * 2 : 2000);
    await db.outbox.where('userId').equals(userId).filter((i) => i.status === 'pending').modify((i) => {
      i.tries += 1;
    });
    setInfo({ phase: offline ? 'offline' : 'error', lastError: e instanceof Error ? e.message : String(e) });
    scheduleSync(backoff);
    return false;
  } finally {
    running = false;
  }
}

/** Pull: назначения, версии курсов, итоговые статусы попыток, сертификаты. */
export async function pullState(userId: string): Promise<SyncState | null> {
  try {
    const since = await getMeta<string | null>(`stateSince:${userId}`, null);
    const s = await api<SyncState>(`/api/sync/state${since ? `?since=${encodeURIComponent(since)}` : ''}`);
    await setMeta(`syncState:${userId}`, s);
    await setMeta(`stateSince:${userId}`, s.server_now);
    for (const a of s.attempts) {
      const local = await db.attempts.get(a.id);
      if (local) await db.attempts.update(a.id, { serverScore: a.score, serverStatus: a.status, certificateNumber: a.certificate?.number ?? null });
    }
    window.dispatchEvent(new CustomEvent('lms:state'));
    return s;
  } catch {
    return null;
  }
}

export async function cachedState(userId: string): Promise<SyncState | null> {
  return getMeta<SyncState | null>(`syncState:${userId}`, null);
}

export function startSyncEngine() {
  if (started) return;
  started = true;
  window.addEventListener('online', () => scheduleSync(300));
  window.addEventListener(OUTBOX_EVENT, () => scheduleSync(2000));
  subscribeNetwork((on) => {
    if (on) scheduleSync(200);
    else setInfo({ phase: 'offline' });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleSync(500);
  });
  setInterval(async () => {
    const uid = currentUserId();
    if (!uid || running) return;
    const n = await db.outbox.where('userId').equals(uid).filter((i) => i.status === 'pending' || i.status === 'sent_qr').count();
    if (n > 0) void syncNow();
  }, 15000);
  scheduleSync(1000);
}

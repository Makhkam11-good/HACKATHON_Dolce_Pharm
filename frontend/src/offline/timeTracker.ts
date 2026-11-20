/**
 * Учёт времени интервалами (раздел 7.4).
 * Длительность — по монотонным часам performance.now(): перевод часов на телефоне её не ломает.
 * Интервал закрывается при уходе с материала, сворачивании, простое 120 с, pagehide; каждые 30 с — чекпойнт.
 */
import { db, getMeta, setMeta } from './db';
import { enqueue } from './outbox';
import { currentUserId } from './session';

const IDLE_MS = 120_000;
const CHECKPOINT_MS = 30_000;
const SESSION_IDLE_MS = 30 * 60_000;

interface Target { courseId: string; materialId: string }
interface OpenInterval extends Target { startWall: number; startMono: number }
interface TrackerState { userId: string; sessionStartedAt: string; lastActivityAt: number }

let target: Target | null = null;
let current: OpenInterval | null = null;
let lastActivityMono = performance.now();
let lastActivityWall = Date.now();
let started = false;
let session: TrackerState | null = null;
const listeners = new Set<() => void>();

const uuid = () => crypto.randomUUID();
const iso = (ms: number) => new Date(ms).toISOString();

async function nextSeq(): Promise<number> {
  const n = (await getMeta<number>('clientSeq', 0)) + 1;
  await setMeta('clientSeq', n);
  return n;
}

async function emit(type: string, startedWall: number, endedWall: number | null, durationMs: number, extra: Record<string, any> = {}, userId = currentUserId()) {
  if (!userId) return;
  await enqueue('event', {
    id: uuid(),
    type,
    client_seq: await nextSeq(),
    started_at_client: iso(startedWall),
    ended_at_client: endedWall != null ? iso(endedWall) : null,
    duration_ms: Math.max(0, Math.round(durationMs)),
    ...extra,
  }, userId);
}

function notify() {
  listeners.forEach((l) => l());
}

function startInterval() {
  if (!target || current || document.visibilityState === 'hidden') return;
  current = { ...target, startWall: Date.now(), startMono: performance.now() };
  notify();
}

/** Закрыть текущий интервал. endMono — конец (при простое = момент последней активности). */
async function closeInterval(endMono = performance.now()) {
  const c = current;
  if (!c) return;
  current = null;
  const dur = Math.max(0, endMono - c.startMono);
  notify();
  if (dur < 1000) return;
  await emit('material_interval', c.startWall, c.startWall + dur, dur, { course_id: c.courseId, material_id: c.materialId });
  await addProgress(c.courseId, c.materialId, dur / 1000);
}

async function addProgress(courseId: string, materialId: string, seconds: number, opened = true) {
  const userId = currentUserId();
  if (!userId) return;
  const key = `${userId}:${materialId}`;
  await db.transaction('rw', db.progress, async () => {
    const p = (await db.progress.get(key)) || { key, userId, courseId, materialId, seconds: 0, opened: false };
    p.seconds += seconds;
    p.opened = p.opened || opened;
    await db.progress.put(p);
  });
}

async function saveState() {
  if (session) {
    session.lastActivityAt = lastActivityWall;
    await setMeta('tracker', session);
  }
}

function onActivity() {
  lastActivityMono = performance.now();
  lastActivityWall = Date.now();
  if (session && !current && target) startInterval();
}

const PENDING_KEY = 'lms:pendingInterval';
const STATE_KEY = 'lms:tracker';

/**
 * pagehide: асинхронная запись в IndexedDB может не успеть до выгрузки страницы,
 * поэтому открытый интервал синхронно кладём в localStorage и дописываем в outbox при следующем запуске.
 */
function stashInterval() {
  const c = current;
  if (!c) return;
  current = null;
  const dur = performance.now() - c.startMono;
  const userId = currentUserId();
  try {
    if (dur >= 1000 && userId) {
      localStorage.setItem(PENDING_KEY, JSON.stringify({ userId, courseId: c.courseId, materialId: c.materialId, startWall: c.startWall, dur }));
    }
    if (session) localStorage.setItem(STATE_KEY, JSON.stringify({ ...session, lastActivityAt: lastActivityWall }));
  } catch {
    /* приватный режим — ничего не поделать */
  }
}

async function recoverStashed() {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(PENDING_KEY);
    localStorage.removeItem(PENDING_KEY);
  } catch {
    return;
  }
  if (!raw) return;
  const p = JSON.parse(raw);
  await emit('material_interval', p.startWall, p.startWall + p.dur, p.dur, { course_id: p.courseId, material_id: p.materialId }, p.userId);
  if (p.userId === currentUserId()) await addProgress(p.courseId, p.materialId, p.dur / 1000);
}

function stashedState(): TrackerState | null {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? (JSON.parse(raw) as TrackerState) : null;
  } catch {
    return null;
  }
}

export function markActivity() {
  onActivity();
}

export async function startSession() {
  const userId = currentUserId();
  if (!userId) return;
  await recoverStashed();
  const fromDb = await getMeta<TrackerState | null>('tracker', null);
  const fromLs = stashedState();
  const prev = fromLs && (!fromDb || (fromLs.sessionStartedAt === fromDb.sessionStartedAt && fromLs.lastActivityAt > fromDb.lastActivityAt)) ? fromLs : fromDb;
  try {
    localStorage.removeItem(STATE_KEY); // актуальное состояние дальше живёт в IndexedDB
  } catch {
    /* ignore */
  }
  if (prev && prev.userId === userId && Date.now() - prev.lastActivityAt < SESSION_IDLE_MS) {
    session = prev; // продолжение после перезагрузки страницы
  } else {
    if (prev) {
      // прошлая сессия не была закрыта (вкладку убили) — закрываем по последней активности
      const st = new Date(prev.sessionStartedAt).getTime();
      await emit('session_end', st, prev.lastActivityAt, prev.lastActivityAt - st, {}, prev.userId);
    }
    const now = Date.now();
    session = { userId, sessionStartedAt: iso(now), lastActivityAt: now };
    await emit('session_start', now, null, 0);
  }
  await saveState();
  initListeners();
}

export async function endSession() {
  await closeInterval();
  if (!session) return;
  const st = new Date(session.sessionStartedAt).getTime();
  const end = Date.now();
  const s = session;
  session = null;
  await setMeta('tracker', null);
  try {
    localStorage.removeItem(STATE_KEY);
  } catch {
    /* ignore */
  }
  await emit('session_end', st, end, end - st, {}, s.userId);
}

export function openMaterial(courseId: string, materialId: string) {
  void closeInterval();
  target = { courseId, materialId };
  onActivity();
  void addProgress(courseId, materialId, 0, true);
  startInterval();
}

export function closeMaterial() {
  target = null;
  void closeInterval();
}

export async function testStarted(courseId: string, testId: string): Promise<{ wall: number; mono: number }> {
  const wall = Date.now();
  await emit('test_start', wall, null, 0, { course_id: courseId, extra_test_id: testId });
  return { wall, mono: performance.now() };
}

export async function testFinished(courseId: string, testId: string, startWall: number, durationMs: number) {
  await emit('test_finish', startWall, startWall + durationMs, durationMs, { course_id: courseId, extra_test_id: testId });
}

/** Секунды текущего открытого интервала (для «живого» счётчика в UI). */
export function liveSeconds(materialId: string): number {
  if (!current || current.materialId !== materialId) return 0;
  return (performance.now() - current.startMono) / 1000;
}

export function subscribeTracker(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

function initListeners() {
  if (started) return;
  started = true;
  ['pointerdown', 'keydown', 'scroll', 'touchstart', 'wheel'].forEach((e) =>
    window.addEventListener(e, onActivity, { passive: true, capture: true }),
  );
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      void closeInterval();
      void saveState();
    } else {
      // вернулись после долгого отсутствия — новая сессия
      if (session && Date.now() - session.lastActivityAt > SESSION_IDLE_MS) {
        const s = session;
        void (async () => {
          const st = new Date(s.sessionStartedAt).getTime();
          session = null;
          await emit('session_end', st, s.lastActivityAt, s.lastActivityAt - st, {}, s.userId);
          await setMeta('tracker', null);
          await startSession();
          onActivity();
        })();
      } else onActivity();
    }
  });
  window.addEventListener('pagehide', () => {
    stashInterval();
    void saveState();
  });
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) {
      void recoverStashed();
      onActivity();
    }
  });
  setInterval(() => {
    const now = performance.now();
    if (current && now - lastActivityMono > IDLE_MS) {
      void closeInterval(lastActivityMono); // простой не считается
    }
  }, 5000);
  setInterval(() => {
    if (current) {
      void closeInterval(); // синхронно обнуляет current…
      startInterval(); // …и сразу открывает следующий интервал без разрыва
    }
    void saveState();
  }, CHECKPOINT_MS);
}

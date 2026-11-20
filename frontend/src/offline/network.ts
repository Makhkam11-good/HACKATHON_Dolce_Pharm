/** Реальная проверка сети: navigator.onLine ненадёжен, поэтому пингуем /api/health с таймаутом 3 с. */
type Listener = (online: boolean) => void;

let online = typeof navigator !== 'undefined' ? navigator.onLine : true;
let onlineSince: number | null = online ? Date.now() : null;
const listeners = new Set<Listener>();
let started = false;
let inflight: Promise<boolean> | null = null;

function set(v: boolean) {
  if (v && !online) onlineSince = Date.now();
  if (!v) onlineSince = null;
  const changed = v !== online;
  online = v;
  if (changed) listeners.forEach((l) => l(v));
}

async function probe(timeoutMs: number): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    set(false);
    return false;
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`/api/health?t=${Date.now()}`, { cache: 'no-store', signal: ctrl.signal });
    set(r.ok);
    return r.ok;
  } catch {
    set(false);
    return false;
  } finally {
    clearTimeout(t);
  }
}

export function checkOnline(timeoutMs = 3000): Promise<boolean> {
  if (inflight) return inflight;
  // сброс — асинхронно, уже после присваивания (иначе синхронно завершившийся промис «залип» бы навсегда)
  const p: Promise<boolean> = probe(timeoutMs).finally(() => {
    if (inflight === p) inflight = null;
  });
  inflight = p;
  return p;
}

export function isOnline() {
  return online;
}

/** Когда клиент заметил появление сети — для метрики «задержка после появления сети». */
export function getOnlineSince(): number | null {
  return onlineSince;
}

export function subscribeNetwork(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function startNetworkMonitor() {
  if (started) return;
  started = true;
  window.addEventListener('online', () => void checkOnline());
  window.addEventListener('offline', () => set(false));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkOnline();
  });
  setInterval(() => void checkOnline(), online ? 10000 : 5000);
  setInterval(() => {
    if (!online) void checkOnline();
  }, 4000);
  void checkOnline();
}

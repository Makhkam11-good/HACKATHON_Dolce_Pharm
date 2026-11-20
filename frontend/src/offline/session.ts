import { db, type SessionRec } from './db';

let cache: SessionRec | null = null;

export async function loadSession(): Promise<SessionRec | null> {
  const s = await db.session.get('current');
  cache = s && new Date(s.expiresAt).getTime() > Date.now() ? s : null;
  return cache;
}

export function currentSession(): SessionRec | null {
  return cache;
}

export function currentUserId(): string | null {
  return cache?.user.id ?? null;
}

export function authToken(): string | null {
  return cache?.token ?? null;
}

export async function saveSession(s: Omit<SessionRec, 'key'>): Promise<SessionRec> {
  cache = { key: 'current', ...s };
  await db.session.put(cache);
  return cache;
}

/** Выход: удаляется только сессия. outbox, файлы и устройство остаются — данные не теряются. */
export async function clearSession(): Promise<void> {
  cache = null;
  await db.session.delete('current');
}

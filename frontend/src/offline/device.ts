import { api } from '../api/client';
import { db, type DeviceRec } from './db';

function shortUA(): string {
  const ua = navigator.userAgent;
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iOS' : /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'macOS' : 'Linux';
  const br = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : 'Browser';
  return `${os} · ${br}`;
}

export async function getDevice(userId: string): Promise<DeviceRec | undefined> {
  return db.device.get(userId);
}

/** Регистрируется один раз на пользователя; секрет HMAC больше никогда не запрашивается. */
export async function ensureDevice(userId: string): Promise<DeviceRec> {
  const existing = await db.device.get(userId);
  if (existing) return existing;
  const name = shortUA();
  const r = await api<{ device_id: string; secret_b64: string }>('/api/devices', { body: { name } });
  const rec: DeviceRec = { key: userId, deviceId: r.device_id, secretB64: r.secret_b64, name };
  await db.device.put(rec);
  return rec;
}

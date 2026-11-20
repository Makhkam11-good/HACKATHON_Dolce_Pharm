/**
 * QR-синхронизация без сети (раздел 7.7): компакция → JSON → deflate → HMAC-SHA256 → base64url → чанки по 700 символов.
 * Формат чанка: DPQR1|<batch_id>|<i>|<n>|<crc32 hex>|<данные>
 */
import pako from 'pako';
import type { OutboxItem } from './db';

export const CHUNK_SIZE = 700;
export const QR_PREFIX = 'DPQR1|';

// ---------------------------------------------------------------- кодирование
export function b64urlEncode(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

export function b64Decode(s: string): Uint8Array {
  return b64urlDecode(s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return ((c ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
}

export async function hmacSha256(secretB64: string, data: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', b64Decode(secretB64), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, data));
}

export function newBatchId(): string {
  const a = new Uint32Array(2);
  crypto.getRandomValues(a);
  return (a[0].toString(36) + a[1].toString(36)).padStart(8, '0').slice(0, 8);
}

// ---------------------------------------------------------------- компакция
/** Подряд идущие интервалы одного материала (без разрыва > 5 с, т.е. чекпойнты одного просмотра) склеиваются в один. */
export function compact(items: OutboxItem[]): { id: string; kind: string; payload: Record<string, any> }[] {
  const sorted = [...items].sort((a, b) => (a.payload.client_seq ?? 0) - (b.payload.client_seq ?? 0) || a.createdAt - b.createdAt);
  const out: { id: string; kind: string; payload: Record<string, any> }[] = [];
  let prev: { id: string; kind: string; payload: Record<string, any> } | null = null;
  for (const it of sorted) {
    const p = it.payload;
    if (
      prev &&
      it.kind === 'event' &&
      prev.kind === 'event' &&
      p.type === 'material_interval' &&
      prev.payload.type === 'material_interval' &&
      p.material_id === prev.payload.material_id &&
      Math.abs(new Date(p.started_at_client).getTime() - new Date(prev.payload.ended_at_client).getTime()) <= 5000
    ) {
      const pp = prev.payload;
      pp.merged_ids = pp.merged_ids || [prev.id];
      pp.merged_ids.push(it.id);
      pp.duration_ms = (pp.duration_ms || 0) + (p.duration_ms || 0);
      if (new Date(p.started_at_client) < new Date(pp.started_at_client)) pp.started_at_client = p.started_at_client;
      if (new Date(p.ended_at_client) > new Date(pp.ended_at_client)) pp.ended_at_client = p.ended_at_client;
      continue;
    }
    prev = { id: it.id, kind: it.kind, payload: { ...p } };
    out.push(prev);
  }
  return out;
}

// ---------------------------------------------------------------- пакет и чанки
export interface Packet {
  v: 1;
  device_id: string;
  user_id: string;
  batch_id: string;
  created_at: string;
  client_now: string;
  items: { id: string; kind: string; payload: Record<string, any> }[];
}

export async function buildPacket(items: OutboxItem[], deviceId: string, userId: string, secretB64: string, batchId = newBatchId()) {
  const now = new Date().toISOString();
  const packet: Packet = { v: 1, device_id: deviceId, user_id: userId, batch_id: batchId, created_at: now, client_now: now, items: compact(items) };
  const bytes = pako.deflate(new TextEncoder().encode(JSON.stringify(packet)), { level: 9 });
  const sig = await hmacSha256(secretB64, bytes);
  const full = `${b64urlEncode(bytes)}.${b64urlEncode(sig)}`;
  return { packet, full, chunks: toChunks(batchId, full), batchId };
}

export function toChunks(batchId: string, full: string, size = CHUNK_SIZE): string[] {
  const n = Math.max(1, Math.ceil(full.length / size));
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const data = full.slice(i * size, (i + 1) * size);
    out.push(`${QR_PREFIX}${batchId}|${i + 1}|${n}|${crc32(data)}|${data}`);
  }
  return out;
}

export interface Chunk { batchId: string; i: number; n: number; data: string }

export function parseChunk(s: string): Chunk | null {
  if (!s.startsWith(QR_PREFIX)) return null;
  const parts = s.split('|');
  if (parts.length !== 6) return null;
  const [, batchId, iS, nS, crc, data] = parts;
  const i = Number(iS);
  const n = Number(nS);
  if (!batchId || !Number.isInteger(i) || !Number.isInteger(n) || i < 1 || i > n) return null;
  if (crc32(data) !== crc) return null;
  return { batchId, i, n, data };
}

export function assemble(chunks: Map<number, string>, n: number): string | null {
  if (chunks.size !== n) return null;
  let s = '';
  for (let i = 1; i <= n; i++) {
    const c = chunks.get(i);
    if (c == null) return null;
    s += c;
  }
  return s;
}

/** Распаковка с проверкой подписи (используется в тестах и для отладки). */
export async function unpack(full: string, secretB64: string): Promise<Packet> {
  const [p, s] = full.split('.');
  const bytes = b64urlDecode(p);
  const sig = b64urlEncode(await hmacSha256(secretB64, bytes));
  if (sig !== s) throw new Error('bad_signature');
  return JSON.parse(new TextDecoder().decode(pako.inflate(bytes)));
}

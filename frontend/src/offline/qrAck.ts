/** Приём QR-подтверждения от мастера: DPACK1|<batch_id>|<accepted_count>|<base64url(hmac(secret, batch_id))> */
import { db } from './db';
import { b64urlEncode, hmacSha256 } from './qrExport';

export interface Ack { batchId: string; accepted: number }

export async function verifyAck(text: string, secretB64: string): Promise<Ack | null> {
  const parts = text.trim().split('|');
  if (parts.length !== 4 || parts[0] !== 'DPACK1') return null;
  const [, batchId, count, sig] = parts;
  const expected = b64urlEncode(await hmacSha256(secretB64, new TextEncoder().encode(batchId)));
  if (expected !== sig) return null;
  return { batchId, accepted: Number(count) };
}

/** Элементы батча помечаются как подтверждённые сервером (sent вместо sent_qr). */
export async function applyAck(ack: Ack): Promise<number> {
  return db.outbox.where('qrBatch').equals(ack.batchId).modify({ status: 'sent' });
}

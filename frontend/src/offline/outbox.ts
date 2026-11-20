import { db, type OutboxItem, type OutboxKind } from './db';
import { isOnline } from './network';
import { currentUserId } from './session';

export const OUTBOX_EVENT = 'lms:outbox';

/** Любое действие пользователя сначала пишется в локальную очередь — потом уходит по сети или через QR. */
export async function enqueue(kind: OutboxKind, payload: Record<string, any>, userId = currentUserId()): Promise<void> {
  if (!userId) return;
  const id: string = payload.id;
  const item: OutboxItem = {
    id,
    kind,
    payload: { ...payload, user_id: userId, created_online: isOnline() },
    status: 'pending',
    createdAt: Date.now(),
    tries: 0,
    userId,
  };
  await db.outbox.put(item);
  window.dispatchEvent(new CustomEvent(OUTBOX_EVENT));
}

export function unsentForUser(userId: string) {
  return db.outbox.where('userId').equals(userId).filter((i) => i.status === 'pending' || i.status === 'sent_qr');
}

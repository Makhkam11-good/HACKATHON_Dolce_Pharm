import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { db } from '../offline/db';
import { getSyncInfo, subscribeSync, syncNow } from '../offline/syncEngine';
import { useOnline } from './ui';
import { Icon } from './Icon';

export function useUnsent(userId: string | undefined) {
  return useLiveQuery(
    async () => {
      if (!userId) return { pending: 0, rejected: 0 };
      const all = await db.outbox.where('userId').equals(userId).toArray();
      return {
        pending: all.filter((i) => i.status === 'pending' || i.status === 'sent_qr').length,
        rejected: all.filter((i) => i.status === 'rejected').length,
      };
    },
    [userId],
    { pending: 0, rejected: 0 },
  );
}

/**
 * Индикатор отправки простыми словами: «Всё отправлено» / «Ждёт отправки: 3» / «Отправляем…».
 * Без интернета — спокойно: «Ждёт отправки: N» (без красного). Красный — только если сервер отклонил записи.
 */
export function SyncBadge({ userId, onDark = false }: { userId: string; onDark?: boolean }) {
  const { t } = useTranslation();
  const online = useOnline();
  const [info, setInfo] = useState(getSyncInfo());
  const { pending, rejected } = useUnsent(userId);
  const nav = useNavigate();
  useEffect(() => subscribeSync(setInfo), []);

  let text: string;
  let cls: string;
  let icon: 'check' | 'uploadCloud' | 'refresh' | 'alert' = 'check';
  if (rejected) {
    text = `${t('Есть ошибки')}: ${rejected}`;
    cls = 'bg-red-600 text-white';
    icon = 'alert';
  } else if (online && info.phase === 'syncing') {
    text = t('Отправляем…');
    cls = onDark ? 'bg-white/15 text-white' : 'bg-sky-100 text-sky-900';
    icon = 'refresh';
  } else if (pending) {
    text = `${t('Ждёт отправки')}: ${pending}`;
    cls = 'bg-amber-100 text-amber-900';
    icon = 'uploadCloud';
  } else {
    text = t('Всё отправлено');
    cls = onDark ? 'bg-white/15 text-white' : 'bg-emerald-100 text-emerald-900';
  }
  return (
    <button
      onClick={() => (rejected ? nav('/results') : void syncNow())}
      className={`inline-flex items-center gap-2 rounded-full px-3 sm:px-4 min-h-tap font-semibold whitespace-nowrap max-w-full ${cls}`}
      title={pending && online ? t('Нажмите, чтобы отправить сейчас') : undefined}
      data-testid="sync-badge"
    >
      <Icon name={icon} size={20} className={info.phase === 'syncing' && online ? 'animate-spin' : ''} />
      <span className="min-w-0 truncate">{text}</span>
    </button>
  );
}

/** Без интернета — спокойная плашка (не красная): можно продолжать, всё сохранится. */
export function OfflineBanner() {
  const online = useOnline();
  const { t } = useTranslation();
  if (online) return null;
  return (
    <div className="bg-brand-50 text-slate-800 border-b border-brand-100 px-4 py-2.5 flex items-start gap-3" role="status" data-testid="offline-banner">
      <Icon name="wifiOff" size={22} className="text-brand-700 shrink-0 mt-0.5" />
      <span><b>{t('Нет интернета — можно продолжать учиться.')}</b> {t('Ответы сохранены на телефоне, отправим сами.')}</span>
    </div>
  );
}

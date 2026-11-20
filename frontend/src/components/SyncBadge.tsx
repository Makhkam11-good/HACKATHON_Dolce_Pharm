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

/** «Офлайн · 12 не отправлено» / «Синхронизация…» / «Всё отправлено · 14:32». Красный при отклонённых. */
export function SyncBadge({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const online = useOnline();
  const [info, setInfo] = useState(getSyncInfo());
  const { pending, rejected } = useUnsent(userId);
  const nav = useNavigate();
  useEffect(() => subscribeSync(setInfo), []);

  let text: string;
  let cls: string;
  let icon: 'wifiOff' | 'refresh' | 'check' | 'alert' = 'check';
  if (!online) {
    text = pending ? `${t('Офлайн')} · ${pending} ${t('не отправлено')}` : t('Офлайн');
    cls = 'bg-slate-700 text-white';
    icon = 'wifiOff';
  } else if (info.phase === 'syncing') {
    text = t('Синхронизация…');
    cls = 'bg-sky-100 text-sky-900';
    icon = 'refresh';
  } else if (pending) {
    text = `${pending} ${t('не отправлено')}`;
    cls = 'bg-amber-100 text-amber-900';
    icon = 'refresh';
  } else {
    const time = info.lastSyncAt ? new Date(info.lastSyncAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
    text = `${t('Всё отправлено')}${time ? ` · ${time}` : ''}`;
    cls = 'bg-emerald-100 text-emerald-900';
  }
  if (rejected) {
    cls = 'bg-red-600 text-white';
    icon = 'alert';
    text = `${text} · ${t('отклонено')}: ${rejected}`;
  }
  return (
    <button
      onClick={() => (rejected ? nav('/results') : void syncNow())}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 min-h-[40px] text-sm font-semibold whitespace-nowrap ${cls}`}
      title={t('Нажмите, чтобы синхронизировать')}
    >
      <Icon name={icon} size={16} className={info.phase === 'syncing' ? 'animate-spin' : ''} />
      <span className="max-w-[46vw] truncate">{text}</span>
    </button>
  );
}

export function OfflineBanner() {
  const online = useOnline();
  const { t } = useTranslation();
  if (online) return null;
  return (
    <div className="bg-slate-800 text-white text-center text-sm px-4 py-2" role="status">
      {t('Нет сети — вы можете продолжать обучение. Данные отправятся автоматически')}
    </div>
  );
}

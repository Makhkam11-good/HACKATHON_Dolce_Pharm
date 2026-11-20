import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { db } from '../offline/db';
import { Button } from './ui';

/** Сколько записей outbox ещё не ушло ни по сети, ни через QR — именно они попадут в QR-пакет. */
export function usePendingCount(userId: string | undefined): number {
  return useLiveQuery(() => (userId ? db.outbox.where('[userId+status]').equals([userId, 'pending']).count() : 0), [userId], 0) ?? 0;
}

/** Главная кнопка сотрудника «Передать мастеру без сети» (раздел «Ещё», экран результата теста). */
export function QrTransferButton({ onNavigate, className = '' }: { onNavigate?: () => void; className?: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const nav = useNavigate();
  const pending = usePendingCount(user?.id);
  if (!user || user.role !== 'employee') return null;
  return (
    <div className={className}>
      <Button big icon="qr" className="w-full" disabled={!pending} onClick={() => { onNavigate?.(); nav('/qr-transfer'); }}>
        {t('Передать мастеру без сети')}
      </Button>
      <div className="text-sm text-slate-500 mt-1 text-center">
        {pending ? t('Не отправлено записей: {{n}}', { n: pending }) : t('Всё уже отправлено')}
      </div>
    </div>
  );
}

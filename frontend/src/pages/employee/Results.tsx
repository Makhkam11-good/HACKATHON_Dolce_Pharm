import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { download, errorText } from '../../api/client';
import { useAuth } from '../../auth';
import { Icon } from '../../components/Icon';
import { QrTransferButton } from '../../components/QrTransferButton';
import { Alert, Badge, Button, Card, EmptyState, fmtDate, fmtDuration, PageTitle, StatusBadge, type StatusKind, useOnline } from '../../components/ui';
import { db } from '../../offline/db';
import { exportLocal } from '../../offline/localExport';
import { useAttempts, useSyncState } from '../../offline/progress';

const REASONS: Record<string, string> = {
  attempt_limit_exceeded: 'превышен лимит попыток', user_mismatch: 'чужие данные', unknown_test: 'тест удалён или изменён',
  assessment_closed: 'оценка уже закрыта', invalid: 'ошибка данных',
};

export default function Results() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const online = useOnline();
  const state = useSyncState(user?.id);
  const attempts = useAttempts(user?.id, state, true);
  const [err, setErr] = useState('');
  const progress = useLiveQuery(() => (user ? db.progress.where('userId').equals(user.id).toArray() : []), [user?.id], []);
  const courses = useLiveQuery(() => db.courses.toArray(), [], []);
  const rejected = useLiveQuery(() => (user ? db.outbox.where('[userId+status]').equals([user.id, 'rejected']).toArray() : []), [user?.id], []);
  const titles = new Map<string, string>();
  (courses || []).forEach((c) => titles.set(c.id, c.manifest.course.title));
  state?.assignments.forEach((a) => titles.set(a.course_id, a.title));
  const timeByCourse = new Map<string, number>();
  (progress || []).forEach((p) => timeByCourse.set(p.courseId, (timeByCourse.get(p.courseId) || 0) + p.seconds));
  const total = [...timeByCourse.values()].reduce((a, b) => a + b, 0);

  const exp = async (f: 'csv' | 'xlsx') => {
    setErr('');
    try {
      await exportLocal(user!.id, user!.full_name, f);
    } catch (e) {
      setErr(errorText(e));
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <PageTitle>{t('Мои результаты')}</PageTitle>
      {user?.role === 'employee' && <QrTransferButton className="mb-5" />}
      {err && <div className="mb-3"><Alert kind="error">{err}</Alert></div>}

      {(rejected || []).length > 0 && (
        <div className="mb-4"><Alert kind="error">
          <div className="font-bold mb-1">{t('Не все записи приняты')}: {rejected!.length}</div>
          <div className="mb-1">{t('Покажите это мастеру — он поможет разобраться.')}</div>
          <ul className="list-disc pl-5">{rejected!.slice(0, 5).map((r) => <li key={r.id}>{r.kind === 'attempt' ? t('Попытка теста') : t('Запись')}: {t(REASONS[r.reason || ''] || r.reason || '')}</li>)}</ul>
        </Alert></div>
      )}

      <h2 className="text-xl font-bold mb-3">{t('Тесты')}</h2>
      {!attempts.length && <EmptyState icon="award" title={t('Вы ещё не сдавали тесты')}>{t('Результаты появятся здесь после первого теста.')}</EmptyState>}
      <div className="space-y-3 mb-7">
        {attempts.map((a) => (
          <Card key={a.id} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold text-lg text-slate-900 leading-snug">{titles.get(a.courseId) || t('Курс')}</div>
                <div className="text-slate-600">{fmtDate(a.finishedAt)}</div>
              </div>
              <span className="text-3xl font-extrabold text-slate-900">{a.score ?? a.clientScore}%</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <StatusBadge status={(a.status === 'failed' ? 'failed_final' : a.status) as StatusKind} />
              {a.synced ? <Badge color="green"><Icon name="check" size={16} />{t('Отправлено')}</Badge> : <Badge color="amber"><Icon name="uploadCloud" size={16} />{t('Ждёт отправки')}</Badge>}
              {a.certificate && (
                <>
                  <Badge color="teal"><Icon name="award" size={16} />{t('Сертификат')} {a.certificate.number}</Badge>
                  {a.certificate.id && (
                    <Button variant="ghost" icon="download" disabled={!online} onClick={() => void download(`/api/certificates/${a.certificate!.id}/pdf`, `${a.certificate!.number}.pdf`).catch((e) => setErr(errorText(e)))}>
                      {online ? t('Скачать сертификат') : t('Сертификат — когда появится интернет')}
                    </Button>
                  )}
                </>
              )}
            </div>
          </Card>
        ))}
      </div>

      <h2 className="text-xl font-bold mb-3">{t('Время обучения')}</h2>
      <Card className="p-4 mb-6">
        <div className="text-slate-700 text-lg">{t('Всего')}: <b className="text-slate-900">{fmtDuration(total)}</b></div>
        <ul className="mt-2 space-y-1.5">
          {[...timeByCourse.entries()].map(([cid, s]) => <li key={cid} className="flex justify-between gap-3"><span>{titles.get(cid) || cid}</span><b className="shrink-0">{fmtDuration(s)}</b></li>)}
        </ul>
      </Card>
      <details className="mb-4">
        <summary className="min-h-tap flex items-center gap-2 text-brand-700 font-semibold cursor-pointer"><Icon name="download" size={20} />{t('Скачать свои результаты файлом')}</summary>
        <div className="flex flex-wrap gap-3 mt-2">
          <Button variant="secondary" icon="download" onClick={() => void exp('xlsx')}>{t('Файл Excel')}</Button>
          <Button variant="secondary" icon="download" onClick={() => void exp('csv')}>{t('Файл CSV')}</Button>
        </div>
        <div className="text-slate-600 mt-1">{t('Работает и без интернета — из данных на телефоне.')}</div>
      </details>
    </div>
  );
}

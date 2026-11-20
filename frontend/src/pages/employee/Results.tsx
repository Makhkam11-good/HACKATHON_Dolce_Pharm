import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { download, errorText } from '../../api/client';
import { useAuth } from '../../auth';
import { Icon } from '../../components/Icon';
import { Alert, Badge, Button, Card, Empty, fmtDate, fmtDuration, PageTitle, useOnline } from '../../components/ui';
import { db } from '../../offline/db';
import { exportLocal } from '../../offline/localExport';
import { STATUS_COLOR, STATUS_LABEL, useAttempts, useSyncState } from '../../offline/progress';

const REASONS: Record<string, string> = {
  attempt_limit_exceeded: 'превышен лимит попыток', user_mismatch: 'чужие данные', unknown_test: 'тест удалён или изменён',
  assessment_closed: 'оценка уже закрыта', invalid: 'ошибка данных',
};

export default function Results() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const online = useOnline();
  const state = useSyncState(user?.id);
  const attempts = useAttempts(user?.id, state);
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
    <div className="max-w-3xl">
      <PageTitle actions={<>
        <Button variant="secondary" icon="download" onClick={() => void exp('xlsx')}>XLSX</Button>
        <Button variant="secondary" icon="download" onClick={() => void exp('csv')}>CSV</Button>
      </>} sub={t('Выгрузка работает и без сети — из данных на телефоне')}>{t('Мои результаты')}</PageTitle>
      {err && <div className="mb-3"><Alert kind="error">{err}</Alert></div>}

      {(rejected || []).length > 0 && (
        <div className="mb-4"><Alert kind="error">
          <div className="font-bold mb-1">{t('Сервер отклонил записи')}: {rejected!.length}</div>
          <ul className="text-sm list-disc pl-5">{rejected!.slice(0, 5).map((r) => <li key={r.id}>{r.kind === 'attempt' ? t('Попытка теста') : t('Запись')}: {t(REASONS[r.reason || ''] || r.reason || '')}</li>)}</ul>
        </Alert></div>
      )}

      <h2 className="text-lg font-bold mb-2">{t('Прогресс')}</h2>
      <Card className="p-4 mb-6">
        <div className="text-slate-600">{t('Общее время обучения')}: <b className="text-slate-900">{fmtDuration(total)}</b></div>
        <ul className="mt-2 space-y-1">
          {[...timeByCourse.entries()].map(([cid, s]) => <li key={cid} className="flex justify-between gap-2"><span>{titles.get(cid) || cid}</span><b>{fmtDuration(s)}</b></li>)}
        </ul>
      </Card>

      <h2 className="text-lg font-bold mb-2">{t('Попытки тестов')}</h2>
      {!attempts.length && <Empty icon="award">{t('Вы ещё не проходили тесты')}</Empty>}
      <div className="space-y-2">
        {attempts.map((a) => (
          <Card key={a.id} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-semibold">{titles.get(a.courseId) || t('Курс')}</div>
                <div className="text-sm text-slate-500">{fmtDate(a.finishedAt)}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-black">{a.score ?? a.clientScore}%</span>
                <Badge color={STATUS_COLOR[a.status] || 'slate'}>{t(STATUS_LABEL[a.status] || a.status)}</Badge>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-2 text-sm">
              {a.synced ? <Badge color="green"><Icon name="check" size={14} />{t('на сервере')}</Badge> : <Badge color="amber">{t('ждёт отправки')}</Badge>}
              {a.certificate && (
                <>
                  <Badge color="teal"><Icon name="award" size={14} />{a.certificate.number}</Badge>
                  {a.certificate.id && (
                    <Button variant="ghost" icon="download" disabled={!online} onClick={() => void download(`/api/certificates/${a.certificate!.id}/pdf`, `${a.certificate!.number}.pdf`).catch((e) => setErr(errorText(e)))}>
                      {online ? t('Сертификат PDF') : t('PDF — только онлайн')}
                    </Button>
                  )}
                </>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

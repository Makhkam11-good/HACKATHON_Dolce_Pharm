import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { errorText } from '../../api/client';
import { useAuth } from '../../auth';
import { Icon } from '../../components/Icon';
import { Alert, Badge, Button, Card, Empty, fmtBytes, fmtDate, PageTitle, ProgressBar, Spinner, useOnline } from '../../components/ui';
import { db, type CourseRec } from '../../offline/db';
import { downloadCourse, type Progress } from '../../offline/downloader';
import { courseStatus, materialStudied, STATUS_COLOR, STATUS_LABEL, useAttempts, useSyncState, type MergedAttempt } from '../../offline/progress';
import { pullState } from '../../offline/syncEngine';
import type { AssignmentState } from '../../types';

export default function MyCourses() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const online = useOnline();
  const state = useSyncState(user?.id);
  const attempts = useAttempts(user?.id, state);
  const local = useLiveQuery(() => db.courses.toArray(), [], [] as CourseRec[]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (online && user) {
      setRefreshing(true);
      void pullState(user.id).finally(() => setRefreshing(false));
    }
  }, [online, user]);

  if (state === undefined) return <Spinner />;
  // офлайн без загруженного состояния — показываем скачанные курсы
  const list: AssignmentState[] = state?.assignments?.length
    ? state.assignments
    : (local || []).map((c) => ({
        id: c.id, course_id: c.id, title: c.manifest.course.title, description: c.manifest.course.description, version: c.version,
        cover_color: c.manifest.course.cover_color || '#1f6f5c', pass_score: c.manifest.course.pass_score, due_date: null,
        materials_count: c.manifest.materials.length, test_id: c.manifest.test?.id || null, max_attempts: c.manifest.test?.max_attempts || null,
      }));

  return (
    <div>
      <PageTitle sub={refreshing ? t('Обновление…') : undefined}>{t('Мои курсы')}</PageTitle>
      {!list.length && <Empty>{online ? t('Вам пока не назначено ни одного курса') : t('Нет скачанных курсов. Подключитесь к сети, чтобы скачать курсы.')}</Empty>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((a) => (
          <CourseCard key={a.course_id} a={a} rec={(local || []).find((c) => c.id === a.course_id)} attempts={attempts} userId={user!.id} />
        ))}
      </div>
    </div>
  );
}

function CourseCard({ a, rec, attempts, userId }: { a: AssignmentState; rec?: CourseRec; attempts: MergedAttempt[]; userId: string }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const online = useOnline();
  const [prog, setProg] = useState<Progress | null>(null);
  const [err, setErr] = useState('');
  const recs = useLiveQuery(() => db.progress.where('[userId+courseId]').equals([userId, a.course_id]).toArray(), [userId, a.course_id], []);
  let percent = 0;
  if (rec) {
    const by = new Map((recs || []).map((r) => [r.materialId, r]));
    const mats = rec.manifest.materials;
    percent = mats.length ? Math.round((100 * mats.filter((m) => materialStudied(m, by.get(m.id))).length) / mats.length) : 0;
  } else if (a.materials_count) {
    percent = Math.round((100 * Math.min(a.materials_count, (recs || []).filter((r) => r.opened).length)) / a.materials_count);
  }
  const status = courseStatus(attempts, a.course_id, (recs || []).length > 0);
  if (status === 'passed') percent = 100;
  const overdue = a.due_date && status !== 'passed' && new Date(a.due_date) < new Date(new Date().toDateString());
  const update = rec && a.version > rec.version;

  const download = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setErr('');
    try {
      await downloadCourse(a.course_id, setProg);
    } catch (ex) {
      setErr(errorText(ex));
    } finally {
      setProg(null);
    }
  };

  return (
    <Card className="overflow-hidden flex flex-col" onClick={() => nav(`/course/${a.course_id}`)}>
      <div className="h-3" style={{ background: a.cover_color }} />
      <div className="p-4 flex-1 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-lg font-bold leading-snug">{a.title}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge color={STATUS_COLOR[status]}>{t(STATUS_LABEL[status])}</Badge>
          {a.due_date && <Badge color={overdue ? 'red' : 'slate'}><Icon name="clock" size={14} />{t('до')} {fmtDate(a.due_date, false)}</Badge>}
        </div>
        <div>
          <div className="flex justify-between text-sm text-slate-600 mb-1"><span>{t('Прогресс')}</span><span>{percent}%</span></div>
          <ProgressBar value={percent} />
        </div>
        <div className="mt-auto" onClick={(e) => e.stopPropagation()}>
          {prog ? (
            <div>
              <div className="text-sm text-slate-600 mb-1">{t('Скачивание')}: {fmtBytes(prog.done)} / {fmtBytes(prog.total)}</div>
              <ProgressBar value={prog.total ? (100 * prog.done) / prog.total : 50} />
            </div>
          ) : rec && rec.status === 'complete' && !update ? (
            <Badge color="teal"><Icon name="check" size={16} />{t('Доступен офлайн')}</Badge>
          ) : rec && rec.status === 'partial' ? (
            <Button variant="secondary" icon="download" disabled={!online} onClick={download} className="w-full">{t('Скачан частично — докачать')}</Button>
          ) : update ? (
            <Button variant="secondary" icon="refresh" disabled={!online} onClick={download} className="w-full">{t('Доступно обновление')}</Button>
          ) : (
            <Button variant="secondary" icon="download" disabled={!online} onClick={download} className="w-full">{t('Скачать офлайн')}</Button>
          )}
          {err && <div className="mt-2"><Alert kind="error">{err}</Alert></div>}
        </div>
      </div>
    </Card>
  );
}

import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { errorText } from '../../api/client';
import { useAuth } from '../../auth';
import { Icon } from '../../components/Icon';
import { Onboarding, onboardingSeen } from '../../components/Onboarding';
import { Banner, BigActionCard, Button, EmptyState, fmtBytes, fmtDate, ProgressBar, Spinner, StatusBadge, type StatusKind, useOnline } from '../../components/ui';
import { db, type CourseRec, type ProgressRec } from '../../offline/db';
import { downloadCourse, type Progress } from '../../offline/downloader';
import { courseStatus, nextMaterial, studyProgress, useAttempts, useSyncState, type MergedAttempt } from '../../offline/progress';
import { pullState } from '../../offline/syncEngine';
import type { AssignmentState } from '../../types';

/** Всё, что нужно знать о курсе для главной: статус, процент, следующий шаг. */
interface Info {
  a: AssignmentState;
  rec?: CourseRec;
  saved: boolean;
  update: boolean;
  status: ReturnType<typeof courseStatus>;
  percent: number;
  attemptsLeft: number;
  overdue: boolean;
  next: ReturnType<typeof nextMaterial>;
}

function buildInfo(a: AssignmentState, rec: CourseRec | undefined, recs: ProgressRec[], attempts: MergedAttempt[]): Info {
  const by = new Map(recs.filter((r) => r.courseId === a.course_id).map((r) => [r.materialId, r]));
  const status = courseStatus(attempts, a.course_id, by.size > 0);
  let percent = 0;
  let next: Info['next'] = null;
  if (rec) {
    percent = studyProgress(rec.manifest.materials, by).percent;
    next = nextMaterial(rec.manifest.materials, by);
  } else if (a.materials_count) {
    percent = Math.round((100 * Math.min(a.materials_count, [...by.values()].filter((r) => r.opened).length)) / a.materials_count);
  }
  if (status === 'passed') percent = 100;
  const max = rec?.manifest.test?.max_attempts ?? a.max_attempts ?? 0;
  const used = attempts.filter((x) => x.courseId === a.course_id).length;
  return {
    a, rec, status, percent, next,
    saved: !!rec && rec.status === 'complete',
    update: !!rec && a.version > rec.version,
    attemptsLeft: Math.max(0, max - used),
    overdue: !!a.due_date && status !== 'passed' && new Date(a.due_date) < new Date(new Date().toDateString()),
  };
}

function statusKind(i: Info): StatusKind {
  if (i.status === 'failed') return i.attemptsLeft > 0 ? 'failed' : 'failed_final';
  return i.status;
}

/** Главный курс: начатый и сохранённый → сохранённый → любой несданный. */
function pickCurrent(list: Info[]): Info | undefined {
  const open = list.filter((i) => i.status !== 'passed');
  return open.find((i) => i.saved && i.status === 'in_progress') || open.find((i) => i.saved) || open[0];
}

export default function MyCourses() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const online = useOnline();
  const state = useSyncState(user?.id);
  const attempts = useAttempts(user?.id, state);
  const local = useLiveQuery(() => db.courses.toArray(), [], [] as CourseRec[]);
  const recs = useLiveQuery(() => (user ? db.progress.where('userId').equals(user.id).toArray() : []), [user?.id], [] as ProgressRec[]);
  const [showIntro, setShowIntro] = useState(() => !!user && user.role === 'employee' && !onboardingSeen(user.id));

  useEffect(() => {
    if (online && user) void pullState(user.id);
  }, [online, user]);

  if (state === undefined || !user) return <Spinner />;
  // без интернета и без загруженного состояния — показываем сохранённые курсы
  const assignments: AssignmentState[] = state?.assignments?.length
    ? state.assignments
    : (local || []).map((c) => ({
        id: c.id, course_id: c.id, title: c.manifest.course.title, description: c.manifest.course.description, version: c.version,
        cover_color: c.manifest.course.cover_color || '#4F007D', pass_score: c.manifest.course.pass_score, due_date: null,
        materials_count: c.manifest.materials.length, test_id: c.manifest.test?.id || null, max_attempts: c.manifest.test?.max_attempts || null,
      }));
  const list = assignments.map((a) => buildInfo(a, (local || []).find((c) => c.id === a.course_id), recs || [], attempts));
  const current = pickCurrent(list);
  const others = list.filter((i) => i !== current);
  const left = list.filter((i) => i.status !== 'passed').length;
  const firstName = user.full_name.split(' ')[1] || user.full_name;

  return (
    <div className="max-w-2xl mx-auto">
      {showIntro && <Onboarding userId={user.id} onDone={() => setShowIntro(false)} />}
      <h1 className="text-[1.6rem] font-bold">{t('Здравствуйте, {{name}}!', { name: firstName })}</h1>
      <p className="text-slate-600 text-lg mb-5">
        {!list.length ? t('Курсов пока нет') : left ? t('Осталось сдать курсов: {{n}}', { n: left }) : t('Всё обучение пройдено. Молодец!')}
      </p>

      {!list.length && (
        <EmptyState icon="bookOpen" title={online ? t('Вам пока не назначили обучение') : t('На телефоне нет сохранённых курсов')}>
          {online ? t('Когда мастер или методист назначит курс, он появится здесь.') : t('Подключитесь к интернету, чтобы сохранить курсы на телефон.')}
        </EmptyState>
      )}

      {current && <CurrentCourse i={current} />}
      {!current && list.length > 0 && (
        <Banner kind="success" title={t('Все курсы сданы')}>{t('Новые курсы появятся здесь, когда их назначат.')}</Banner>
      )}

      {others.length > 0 && (
        <>
          <h2 className="text-xl font-bold mt-7 mb-3">{current ? t('Другие курсы') : t('Мои курсы')}</h2>
          <div className="space-y-3">{others.map((i) => <CourseRow key={i.a.course_id} i={i} />)}</div>
        </>
      )}
    </div>
  );
}

/** Скачивание курса на телефон с прогрессом и понятной ошибкой. */
function useSave(courseId: string) {
  const [prog, setProg] = useState<Progress | null>(null);
  const [err, setErr] = useState('');
  const save = async () => {
    setErr('');
    try {
      await downloadCourse(courseId, setProg);
    } catch (ex) {
      setErr(errorText(ex));
    } finally {
      setProg(null);
    }
  };
  return { prog, err, save };
}

function SaveProgress({ prog }: { prog: Progress }) {
  const { t } = useTranslation();
  return (
    <div>
      <div className="text-slate-700 mb-1.5 font-semibold">{t('Сохраняем на телефон…')} {fmtBytes(prog.done)} / {fmtBytes(prog.total)}</div>
      <ProgressBar value={prog.total ? (100 * prog.done) / prog.total : 50} label={t('Сохранение курса')} />
    </div>
  );
}

function CurrentCourse({ i }: { i: Info }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const online = useOnline();
  const { prog, err, save } = useSave(i.a.course_id);
  const cid = i.a.course_id;

  let eyebrow = t('Продолжить обучение');
  let step: string;
  let action;
  if (!i.saved || i.update) {
    eyebrow = i.update ? t('Курс обновился') : t('Начать обучение');
    step = i.update ? t('Сохраните новую версию на телефон') : `${t('Материалов')}: ${i.a.materials_count}${i.a.due_date ? ` · ${t('Сдать до')} ${fmtDate(i.a.due_date, false)}` : ''}`;
    action = prog ? <SaveProgress prog={prog} /> : (
      <>
        <Button big icon="download" disabled={!online} onClick={() => void save()}>{t('Сохранить на телефон')}</Button>
        <div className="text-slate-600 text-center mt-2">{online ? t('Чтобы учиться даже без интернета') : t('Подключитесь к интернету, чтобы сохранить курс')}</div>
      </>
    );
  } else if (i.next) {
    if (i.status === 'not_started') eyebrow = t('Начать обучение');
    step = `${t('Материал {{k}} из {{n}}', { k: i.next.index, n: i.next.total })} · ${i.next.material.title}`;
    action = <Button big icon="play" onClick={() => nav(`/course/${cid}/m/${i.next!.material.id}`)}>{i.status === 'not_started' ? t('Начать') : t('Продолжить')}</Button>;
  } else if (i.status === 'pending_review') {
    step = t('Тест сдан. Ответ проверяет методист — результат появится здесь.');
    action = <Button big variant="secondary" icon="right" onClick={() => nav(`/course/${cid}`)}>{t('Открыть курс')}</Button>;
  } else if (i.attemptsLeft > 0) {
    step = i.status === 'failed' ? t('Тест не сдан. Можно пересдать — осталось попыток: {{n}}', { n: i.attemptsLeft }) : t('Все материалы изучены · Осталось сдать тест');
    action = <Button big icon="tasks" onClick={() => nav(`/course/${cid}/test`)}>{i.status === 'failed' ? t('Пересдать тест') : t('Перейти к тесту')}</Button>;
  } else {
    step = t('Попытки закончились. Обратитесь к мастеру.');
    action = <Button big variant="secondary" icon="right" onClick={() => nav(`/course/${cid}`)}>{t('Открыть курс')}</Button>;
  }

  return (
    <BigActionCard eyebrow={eyebrow} title={i.a.title} action={action} onTitle={i.saved ? () => nav(`/course/${cid}`) : undefined}>
      <div className="text-lg text-slate-700 mb-3">{step}</div>
      {i.saved && !i.update && (
        <div className="flex items-center gap-3 mb-3">
          <ProgressBar value={i.percent} className="flex-1" label={t('Прогресс курса')} />
          <b className="text-lg text-slate-900 w-14 text-right">{i.percent}%</b>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {i.saved && !i.update && <StatusBadge status="saved" />}
        {i.overdue && <StatusBadge status="overdue" label={`${t('Срок прошёл')}: ${fmtDate(i.a.due_date, false)}`} />}
      </div>
      {err && <div className="mt-3"><Banner kind="error">{err}</Banner></div>}
    </BigActionCard>
  );
}

function CourseRow({ i }: { i: Info }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const online = useOnline();
  const { prog, err, save } = useSave(i.a.course_id);
  const needSave = (!i.saved || i.update) && i.status !== 'passed';
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden" data-course={i.a.course_id}>
      <button type="button" className="w-full text-left p-4 flex items-start gap-3 hover:bg-brand-50/50 active:bg-brand-50" onClick={() => nav(`/course/${i.a.course_id}`)}>
        <span className="flex-1 min-w-0">
          <span className="block text-lg font-semibold text-slate-900 leading-snug mb-2">{i.a.title}</span>
          <span className="flex flex-wrap gap-2">
            <StatusBadge status={statusKind(i)} />
            {i.saved && !i.update && i.status !== 'passed' && <StatusBadge status="saved" />}
            {i.overdue ? <StatusBadge status="overdue" /> : i.a.due_date && i.status !== 'passed' && (
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[0.9rem] font-semibold bg-slate-100 text-slate-700"><Icon name="clock" size={16} />{t('Сдать до')} {fmtDate(i.a.due_date, false)}</span>
            )}
          </span>
        </span>
        <span className="text-xl font-bold text-slate-900 shrink-0">{i.percent}%</span>
      </button>
      {needSave && (
        <div className="px-4 pb-4">
          {prog ? <SaveProgress prog={prog} /> : (
            <Button variant="secondary" icon="download" className="w-full" disabled={!online} onClick={() => void save()}>
              {i.update ? t('Сохранить новую версию') : online ? t('Сохранить на телефон') : t('Нужен интернет, чтобы сохранить')}
            </Button>
          )}
          {err && <div className="mt-2"><Banner kind="error">{err}</Banner></div>}
        </div>
      )}
    </div>
  );
}

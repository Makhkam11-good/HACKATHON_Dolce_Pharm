import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth';
import { Icon } from '../../components/Icon';
import { QuestionRenderer } from '../../components/QuestionRenderer';
import { QrTransferButton } from '../../components/QrTransferButton';
import { Alert, Badge, Button, Card, PageTitle, ProgressBar, Spinner } from '../../components/ui';
import { db, type AttemptRec } from '../../offline/db';
import { gradeHashed } from '../../offline/grading';
import { enqueue } from '../../offline/outbox';
import { useAttempts, useSyncState } from '../../offline/progress';
import { syncNow } from '../../offline/syncEngine';
import { testFinished, testStarted } from '../../offline/timeTracker';
import type { Answer } from '../../types';
import { useManifest } from './CourseView';

// монотонные часы валидны только в пределах одной загрузки страницы
const PAGE_ID = Math.random().toString(36).slice(2);

function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

export default function TestPlayer() {
  const { courseId } = useParams();
  const { t } = useTranslation();
  const { user } = useAuth();
  const nav = useNavigate();
  const m = useManifest(courseId);
  const test = m?.pkg.test;
  const passScore = m?.pkg.course.pass_score ?? 80;
  const state = useSyncState(user?.id);
  const attempts = useAttempts(user?.id, state).filter((a) => a.testId === test?.id);
  const [resultId, setResultId] = useState<string | null>(null);
  const current = useLiveQuery(
    async () => (user && test ? (await db.attempts.where('[userId+testId]').equals([user.id, test.id]).filter((a) => a.status === 'in_progress').first()) ?? null : null),
    [user?.id, test?.id],
  );
  const result = useLiveQuery(() => (resultId ? db.attempts.get(resultId) : undefined), [resultId]);
  const [now, setNow] = useState(Date.now());
  const finishing = useRef(false);

  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  const deadline = current && test?.time_limit_min ? new Date(current.startedAt).getTime() + test.time_limit_min * 60000 : null;
  const remaining = deadline ? Math.max(0, deadline - now) : null;

  const finish = async (a: AttemptRec) => {
    if (!test || !user || finishing.current) return;
    finishing.current = true;
    const g = await gradeHashed(test, a.answers, passScore);
    const finishedAt = new Date().toISOString();
    const upd: Partial<AttemptRec> = { status: g.status, finishedAt, clientScore: g.score, results: g.answers };
    await db.attempts.update(a.id, upd);
    await enqueue('attempt', {
      id: a.id, test_id: test.id, course_version: a.courseVersion, started_at: a.startedAt, finished_at: finishedAt, client_score: g.score,
      answers: test.questions.map((q) => ({ question_id: q.id, ...(a.answers[q.id] || {}) })),
    });
    const dur = a.startedMono != null && a.startedPage === PAGE_ID ? performance.now() - a.startedMono : Date.now() - new Date(a.startedAt).getTime();
    await testFinished(courseId!, test.id, new Date(a.startedAt).getTime(), dur);
    setResultId(a.id);
    finishing.current = false;
    void syncNow();
  };

  useEffect(() => {
    if (current && remaining === 0) void finish(current);
  }, [remaining === 0, current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const order = useMemo(() => current?.questionOrder || [], [current?.questionOrder]);
  if (m === undefined || current === undefined) return <Spinner />;
  if (!test) return <Alert kind="warn">{t('Тест недоступен офлайн. Откройте курс при наличии сети.')}</Alert>;

  const used = attempts.length;
  const left = test.max_attempts - used;

  // ---------------- результат
  if (resultId && result) {
    const showExpl = result.status === 'passed' || left <= 0;
    const wrong = (result.results || []).filter((r) => r.is_correct === false || (r.is_correct !== true && !r.needs_review));
    const review = (result.results || []).filter((r) => r.needs_review);
    const st = result.serverStatus || result.status;
    return (
      <div className="max-w-2xl">
        <PageTitle>{t('Результат')}</PageTitle>
        <Card className="p-6 text-center mb-4">
          <div className={`text-6xl font-black mb-2 ${st === 'passed' ? 'text-emerald-600' : st === 'pending_review' ? 'text-amber-600' : 'text-red-600'}`}>
            {result.serverScore ?? result.clientScore}%
          </div>
          <div className="text-xl font-bold mb-1">
            {st === 'passed' ? t('Сдано') : st === 'pending_review' ? t('На проверке у методиста') : t('Не сдано')}
          </div>
          {result.serverStatus ? (
            <Badge color="green"><Icon name="check" size={14} />{t('Подтверждено сервером')}{result.certificateNumber ? ` · ${t('сертификат')} ${result.certificateNumber}` : ''}</Badge>
          ) : (
            <div className="text-slate-600">{t('Предварительный результат. Итог подтвердится при синхронизации.')}</div>
          )}
        </Card>
        {review.length > 0 && <div className="mb-3"><Alert kind="warn">{t('Открытых ответов на ручной проверке')}: {review.length}</Alert></div>}
        {wrong.length > 0 && (
          <Card className="p-4 mb-4">
            <div className="font-bold mb-2">{t('Вопросы с ошибками')}</div>
            <ul className="space-y-3">
              {wrong.map((r) => {
                const q = test.questions.find((x) => x.id === r.question_id)!;
                return (
                  <li key={r.question_id} className="border-l-4 border-red-300 pl-3">
                    <div className="font-medium">{q.body}</div>
                    {r.points > 0 && <div className="text-sm text-slate-500">{t('Частично')}: {Math.round(r.points * 100) / 100} / {q.points}</div>}
                    {showExpl && q.explanation && <div className="text-sm text-slate-700 mt-1">💡 {q.explanation}</div>}
                  </li>
                );
              })}
            </ul>
            {!showExpl && <div className="text-sm text-slate-500 mt-3">{t('Правильные ответы не показываются, пока остаются попытки.')}</div>}
          </Card>
        )}
        <QrTransferButton className="mb-3" />
        <div className="flex flex-col sm:flex-row gap-2">
          <Button big onClick={() => nav(`/course/${courseId}`)}>{t('К курсу')}</Button>
          <Button big variant="secondary" onClick={() => nav('/results')}>{t('Мои результаты')}</Button>
        </div>
      </div>
    );
  }

  // ---------------- правила / старт
  if (!current) {
    const start = async () => {
      if (!user) return;
      const ids = test.questions.map((q) => q.id);
      const ts = await testStarted(courseId!, test.id);
      await db.attempts.put({
        id: crypto.randomUUID(), testId: test.id, courseId: courseId!, userId: user.id, courseVersion: m!.pkg.course.version,
        status: 'in_progress', answers: {}, questionOrder: test.shuffle_questions ? shuffle(ids) : ids, currentIndex: 0,
        startedAt: new Date(ts.wall).toISOString(), startedMono: ts.mono, startedPage: PAGE_ID,
      });
    };
    return (
      <div className="max-w-2xl">
        <button className="text-brand-700 font-medium mb-2 min-h-tap flex items-center" onClick={() => nav(`/course/${courseId}`)}><Icon name="left" />{t('К курсу')}</button>
        <PageTitle>{test.title}</PageTitle>
        <Card className="p-5 mb-4">
          <ul className="space-y-3 text-lg">
            <li>📝 {t('Вопросов')}: <b>{test.questions.length}</b></li>
            <li>⏱️ {t('Время')}: <b>{test.time_limit_min ? `${test.time_limit_min} ${t('мин')}` : t('не ограничено')}</b></li>
            <li>🎯 {t('Проходной балл')}: <b>{passScore}%</b></li>
            <li>🔁 {t('Попытка')}: <b>{Math.min(used + 1, test.max_attempts)} {t('из')} {test.max_attempts}</b></li>
          </ul>
          <div className="text-slate-500 mt-4">{t('Тест можно пройти без сети. Ответы сохраняются после каждого вопроса.')}</div>
        </Card>
        <Button big icon="play" disabled={left <= 0} onClick={() => void start()}>{left <= 0 ? t('Попытки закончились') : t('Начать тест')}</Button>
      </div>
    );
  }

  // ---------------- вопрос
  const idx = Math.min(current.currentIndex, order.length - 1);
  const q = test.questions.find((x) => x.id === order[idx])!;
  const setAnswer = (a: Answer) => void db.attempts.update(current.id, { answers: { ...current.answers, [q.id]: a } });
  const go = (i: number) => void db.attempts.update(current.id, { currentIndex: i });
  const answered = (id: string) => {
    const a = current.answers[id];
    return !!a && ((a.selected_option_ids?.length ?? 0) > 0 || (a.order_option_ids?.length ?? 0) > 0 || !!a.answer_text?.trim());
  };
  const unanswered = order.filter((id) => !answered(id)).length;

  return (
    <div className="max-w-2xl pb-bottom-bar">
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-slate-600">{t('Вопрос')} {idx + 1} {t('из')} {order.length}</span>
        {remaining != null && (
          <span className={`font-mono font-bold text-lg px-3 py-1 rounded-full ${remaining < 60000 ? 'bg-red-100 text-red-700' : 'bg-slate-100'}`}>
            ⏱ {String(Math.floor(remaining / 60000)).padStart(2, '0')}:{String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0')}
          </span>
        )}
      </div>
      <ProgressBar value={(100 * (idx + 1)) / order.length} className="mb-3" />
      <div className="flex flex-wrap gap-1.5 mb-4">
        {order.map((id, i) => (
          <button key={id} onClick={() => go(i)} className={`w-9 h-9 rounded-lg text-sm font-bold ${i === idx ? 'bg-brand-600 text-white' : answered(id) ? 'bg-brand-100 text-brand-800' : 'bg-slate-100 text-slate-500'}`}>{i + 1}</button>
        ))}
      </div>
      <Card className="p-5"><QuestionRenderer key={q.id} q={q} answer={current.answers[q.id]} onChange={setAnswer} /></Card>
      <div className="bottom-bar bg-white/95 border-t flex gap-2">
        <Button variant="secondary" icon="left" disabled={idx === 0} onClick={() => go(idx - 1)} className="flex-1">{t('Назад')}</Button>
        {idx < order.length - 1 ? (
          <Button onClick={() => go(idx + 1)} className="flex-1">{t('Далее')}<Icon name="right" /></Button>
        ) : (
          <Button variant="success" icon="check" className="flex-1"
            onClick={() => {
              if (!unanswered || window.confirm(t('Без ответа вопросов: {{n}}. Завершить тест?', { n: unanswered }))) void finish(current);
            }}>
            {t('Завершить')}
          </Button>
        )}
      </div>
    </div>
  );
}

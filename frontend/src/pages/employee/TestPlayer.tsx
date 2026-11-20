import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth';
import { Icon } from '../../components/Icon';
import { QuestionRenderer } from '../../components/QuestionRenderer';
import { usePendingCount } from '../../components/QrTransferButton';
import { Banner, Button, Card, ConfirmModal, EmptyState, ProgressBar, Spinner, StatusBadge, useOnline } from '../../components/ui';
import { db, type AttemptRec } from '../../offline/db';
import { gradeHashed } from '../../offline/grading';
import { enqueue } from '../../offline/outbox';
import { useAttempts, useSyncState } from '../../offline/progress';
import { syncNow } from '../../offline/syncEngine';
import { testFinished, testStarted } from '../../offline/timeTracker';
import type { Answer } from '../../types';
import { BackLink, useManifest } from './CourseView';

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
  const [confirm, setConfirm] = useState(false);
  const online = useOnline();
  const pending = usePendingCount(user?.id);

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
  if (!test) {
    return (
      <EmptyState icon="phone" title={t('Тест не сохранён на телефоне')} action={<Button icon="left" onClick={() => nav(`/course/${courseId}`)}>{t('Вернуться к курсу')}</Button>}>
        {t('Подключитесь к интернету и сохраните курс на телефон ещё раз.')}
      </EmptyState>
    );
  }

  const used = attempts.length;
  const left = test.max_attempts - used;

  // ---------------- результат
  if (resultId && result) {
    const showExpl = result.status === 'passed' || left <= 0;
    const wrong = (result.results || []).filter((r) => r.is_correct === false || (r.is_correct !== true && !r.needs_review));
    const review = (result.results || []).filter((r) => r.needs_review);
    const st = result.serverStatus || result.status;
    const score = result.serverScore ?? result.clientScore;
    const look = st === 'passed'
      ? { icon: 'checkCircle' as const, cls: 'text-emerald-700 bg-emerald-100', title: t('Тест сдан!'), text: t('Поздравляем, курс пройден.') }
      : st === 'pending_review'
        ? { icon: 'clock' as const, cls: 'text-amber-800 bg-amber-100', title: t('Ответ проверяет методист'), text: t('Результат появится в разделе «Результаты».') }
        : { icon: 'xCircle' as const, cls: 'text-red-700 bg-red-100', title: t('Тест не сдан'), text: left > 0 ? t('Можно пересдать. Осталось попыток: {{n}}', { n: left }) : t('Попытки закончились. Обратитесь к мастеру.') };
    return (
      <div className="max-w-2xl mx-auto">
        <Card className="p-6 text-center mb-4">
          <span className={`w-20 h-20 rounded-full mx-auto mb-3 flex items-center justify-center ${look.cls}`}><Icon name={look.icon} size={44} /></span>
          <h1 className="text-[1.75rem] font-bold">{look.title}</h1>
          <div className="text-5xl font-extrabold text-slate-900 my-2" data-testid="score">{score}%</div>
          <div className="text-slate-700 text-lg">{t('Чтобы сдать, нужно')} {passScore}%. {look.text}</div>
          <div className="mt-3">
            {result.serverStatus
              ? <StatusBadge status="passed" label={`${t('Результат получен')}${result.certificateNumber ? ` · ${t('сертификат')} ${result.certificateNumber}` : ''}`} />
              : <StatusBadge status="saved" label={online ? t('Сохранено, отправляем…') : t('Сохранено на телефоне, отправим сами')} />}
          </div>
        </Card>
        <div className="flex flex-col gap-3 mb-5">
          {st !== 'passed' && st !== 'pending_review' && left > 0
            ? <Button big icon="refresh" onClick={() => setResultId(null)}>{t('Пересдать тест')}</Button>
            : <Button big icon="home" onClick={() => nav('/my')}>{t('На главную')}</Button>}
          <Button big variant="secondary" icon="award" onClick={() => nav('/results')}>{t('Мои результаты')}</Button>
        </div>
        {!online && pending > 0 && (
          <div className="mb-5 space-y-3">
            <Banner kind="offline">{t('Нет интернета — результат отправится сам, когда появится связь. Если связи не будет долго, передайте результаты мастеру.')}</Banner>
            <Button variant="secondary" icon="send" className="w-full" onClick={() => nav('/qr-transfer')}>{t('Передать результаты мастеру')}</Button>
          </div>
        )}
        {review.length > 0 && <div className="mb-4"><Banner kind="warn">{t('Ответов ждут проверки методиста')}: {review.length}</Banner></div>}
        {wrong.length > 0 && (
          <Card className="p-4">
            <h2 className="text-lg font-bold mb-3">{t('Где были ошибки')}</h2>
            <ul className="space-y-3">
              {wrong.map((r) => {
                const q = test.questions.find((x) => x.id === r.question_id)!;
                return (
                  <li key={r.question_id} className="border-l-4 border-red-400 pl-3">
                    <div className="font-semibold">{q.body}</div>
                    {r.points > 0 && <div className="text-slate-600">{t('Частично верно')}: {Math.round(r.points * 100) / 100} / {q.points}</div>}
                    {showExpl && q.explanation && <div className="text-slate-700 mt-1">💡 {q.explanation}</div>}
                  </li>
                );
              })}
            </ul>
            {!showExpl && <div className="text-slate-600 mt-3">{t('Правильные ответы покажем, когда закончатся попытки.')}</div>}
          </Card>
        )}
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
      <div className="max-w-2xl mx-auto">
        <BackLink to={`/course/${courseId}`}>{t('К курсу')}</BackLink>
        <h1 className="text-[1.6rem] font-bold mb-4">{test.title}</h1>
        <Card className="p-5 mb-4">
          <ul className="space-y-3 text-lg">
            <li className="flex items-center gap-3"><Icon name="tasks" className="text-brand-700" />{t('Вопросов')}: <b>{test.questions.length}</b></li>
            <li className="flex items-center gap-3"><Icon name="clock" className="text-brand-700" />{t('Время')}: <b>{test.time_limit_min ? `${test.time_limit_min} ${t('мин')}` : t('не ограничено')}</b></li>
            <li className="flex items-center gap-3"><Icon name="award" className="text-brand-700" />{t('Чтобы сдать, нужно')}: <b>{passScore}%</b></li>
            <li className="flex items-center gap-3"><Icon name="refresh" className="text-brand-700" />{t('Осталось попыток')}: <b>{Math.max(0, left)}</b></li>
          </ul>
        </Card>
        <div className="mb-5"><Banner kind="info">{t('Можно сдавать без интернета. Каждый ответ сразу сохраняется — если телефон погаснет, продолжите с того же места.')}</Banner></div>
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
  const lastMinute = remaining != null && remaining < 60000;

  return (
    <div className="max-w-2xl mx-auto pb-bottom-bar">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-2">
        <span className="text-lg font-bold text-slate-900 whitespace-nowrap">{t('Вопрос {{k}} из {{n}}', { k: idx + 1, n: order.length })}</span>
        {remaining != null && (
          <span className={`font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5 whitespace-nowrap ${lastMinute ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-700'}`} data-testid="timer">
            <Icon name="clock" size={18} />
            {lastMinute
              ? `${t('Осталось')} ${Math.ceil(remaining / 1000)} ${t('сек')}`
              : `${t('Осталось')} ${Math.ceil(remaining / 60000)} ${t('мин')}`}
          </span>
        )}
      </div>
      <ProgressBar value={(100 * (idx + 1)) / order.length} className="mb-4" label={t('Прогресс теста')} />
      <Card className="p-5"><QuestionRenderer key={q.id} q={q} answer={current.answers[q.id]} onChange={setAnswer} /></Card>

      <details className="mt-4">
        <summary className="min-h-tap flex items-center gap-2 text-brand-700 font-semibold cursor-pointer select-none">
          <Icon name="menu" size={20} />{t('Все вопросы')}{unanswered ? ` · ${t('без ответа')}: ${unanswered}` : ''}
        </summary>
        <div className="flex flex-wrap gap-3 mt-2">
          {order.map((id, i) => (
            <button key={id} onClick={() => go(i)} aria-label={`${t('Вопрос')} ${i + 1}`}
              className={`w-12 h-12 rounded-xl font-bold ${i === idx ? 'bg-brand-600 text-white' : answered(id) ? 'bg-brand-100 text-brand-800' : 'bg-white border-2 border-slate-300 text-slate-700'}`}>
              {i + 1}
            </button>
          ))}
        </div>
      </details>

      <div className="bottom-bar bg-white/95 border-t border-slate-200 flex gap-3">
        <Button variant="secondary" icon="left" disabled={idx === 0} onClick={() => go(idx - 1)} className="flex-1 min-h-big">{t('Назад')}</Button>
        {idx < order.length - 1 ? (
          <Button onClick={() => go(idx + 1)} className="flex-1 min-h-big">{t('Далее')}<Icon name="right" /></Button>
        ) : (
          <Button variant="success" icon="check" className="flex-1 min-h-big" onClick={() => setConfirm(true)}>{t('Завершить тест')}</Button>
        )}
      </div>
      <ConfirmModal
        open={confirm}
        title={t('Завершить тест?')}
        confirmText={t('Завершить')}
        cancelText={t('Вернуться к вопросам')}
        onConfirm={() => { setConfirm(false); void finish(current); }}
        onCancel={() => setConfirm(false)}
      >
        {t('Изменить ответы будет нельзя.')}
        {unanswered > 0 && <div className="mt-2 font-semibold text-amber-800">{t('Без ответа вопросов: {{n}}', { n: unanswered })}</div>}
      </ConfirmModal>
    </div>
  );
}

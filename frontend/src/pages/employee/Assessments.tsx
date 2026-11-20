import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { useAuth } from '../../auth';
import { Alert, Badge, Button, Card, Empty, inputCls, PageTitle, useOnline } from '../../components/ui';
import { db } from '../../offline/db';
import { enqueue } from '../../offline/outbox';
import { syncNow } from '../../offline/syncEngine';
import type { AssessmentTask } from '../../types';

const ROLE: Record<string, string> = { self: 'Самооценка', manager: 'Как руководитель', peer: 'Как коллега' };

export default function Assessments() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const online = useOnline();
  const recs = useLiveQuery(() => (user ? db.assessments.where('userId').equals(user.id).toArray() : []), [user?.id], []);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!online || !user) return;
    void api<AssessmentTask[]>('/api/assessments/my-tasks').then(async (tasks) => {
      await db.transaction('rw', db.assessments, async () => {
        const existing = await db.assessments.where('userId').equals(user.id).toArray();
        for (const e of existing) if (!tasks.find((x) => `${user.id}:${x.id}` === e.id)) await db.assessments.delete(e.id);
        for (const task of tasks) {
          const prev = await db.assessments.get(`${user.id}:${task.id}`);
          await db.assessments.put({ id: `${user.id}:${task.id}`, userId: user.id, task, submitted: task.completed || !!prev?.submitted });
        }
      });
    }).catch(() => undefined);
  }, [online, user]);

  const list = recs || [];
  const current = list.find((r) => r.id === openId);
  if (current) return <Form rec={current} onDone={() => setOpenId(null)} />;

  return (
    <div className="max-w-2xl">
      <PageTitle sub={t('Оцените компетенции по шкале от 1 до 5. Работает без сети.')}>{t('Оценка 360')}</PageTitle>
      {!list.length && <Empty icon="star">{online ? t('Нет назначенных оценок') : t('Задачи оценки появятся после синхронизации')}</Empty>}
      <div className="space-y-2">
        {list.map((r) => (
          <Card key={r.id} className="p-4 flex items-center gap-3" onClick={() => setOpenId(r.id)}>
            <div className="flex-1">
              <div className="font-semibold">{r.task.rater_role === 'self' ? t('Оценить: себя') : `${t('Оценить')}: ${r.task.subject_name}`}</div>
              <div className="text-sm text-slate-500">{t(ROLE[r.task.rater_role])} · {r.task.period}</div>
            </div>
            {r.submitted ? <Badge color="green">{t('Отправлено')}</Badge> : <Badge color="amber">{t('Ожидает')}</Badge>}
          </Card>
        ))}
      </div>
    </div>
  );
}

function Form({ rec, onDone }: { rec: { id: string; task: AssessmentTask; submitted: boolean; userId: string }; onDone: () => void }) {
  const { t } = useTranslation();
  const task = rec.task;
  const [scores, setScores] = useState<Record<string, number>>(() => Object.fromEntries(Object.entries(task.answers).map(([k, v]) => [k, v.score])));
  const [comments, setComments] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(task.answers).map(([k, v]) => [k, v.comment || ''])));
  const done = task.competencies.every((c) => scores[c.id]);

  const submit = async () => {
    for (const c of task.competencies) {
      await enqueue('assessment_response', { id: crypto.randomUUID(), assessment_id: task.id, competency_id: c.id, score: scores[c.id], comment: comments[c.id] || null });
    }
    const answers = Object.fromEntries(task.competencies.map((c) => [c.id, { score: scores[c.id], comment: comments[c.id] || null }]));
    await db.assessments.put({ ...rec, task: { ...task, answers }, submitted: true });
    void syncNow();
    onDone();
  };

  return (
    <div className="max-w-2xl pb-8">
      <button className="text-brand-700 font-medium mb-2 min-h-tap" onClick={onDone}>← {t('Назад')}</button>
      <PageTitle sub={`${task.subject_name}${task.subject_position ? ` · ${task.subject_position}` : ''} · ${task.period}`}>
        {task.rater_role === 'self' ? t('Самооценка') : t('Оценка коллеги')}
      </PageTitle>
      {rec.submitted && <div className="mb-3"><Alert kind="success">{t('Оценка уже отправлена. Можно изменить и отправить ещё раз.')}</Alert></div>}
      <div className="space-y-3">
        {task.competencies.map((c) => (
          <Card key={c.id} className="p-4">
            <div className="font-semibold">{c.name}</div>
            <div className="text-sm text-slate-500 mb-3">{c.description}</div>
            <div className="grid grid-cols-5 gap-2 mb-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setScores({ ...scores, [c.id]: n })}
                  className={`min-h-[56px] rounded-xl text-xl font-bold border-2 ${scores[c.id] === n ? 'bg-brand-600 border-brand-600 text-white' : 'border-slate-200 hover:border-brand-300'}`}>{n}</button>
              ))}
            </div>
            <div className="flex justify-between text-xs text-slate-500 mb-2"><span>{t('совсем не проявляет')}</span><span>{t('образец для других')}</span></div>
            <input className={inputCls} placeholder={t('Комментарий (необязательно)')} value={comments[c.id] || ''} onChange={(e) => setComments({ ...comments, [c.id]: e.target.value })} />
          </Card>
        ))}
      </div>
      <div className="mt-4"><Button big icon="check" disabled={!done} onClick={() => void submit()}>{t('Отправить оценку')}</Button></div>
    </div>
  );
}

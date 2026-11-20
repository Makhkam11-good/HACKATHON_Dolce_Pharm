import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { api, errorText } from '../../api/client';
import { Icon } from '../../components/Icon';
import { QuestionRenderer } from '../../components/QuestionRenderer';
import { Alert, Badge, Button, Card, Field, inputCls, PageTitle, Spinner } from '../../components/ui';
import type { Answer } from '../../types';

type QType = 'single' | 'multi' | 'open' | 'order';
interface Opt { id?: string; text: string; is_correct: boolean }
interface Q { id?: string; key: string; type: QType; body: string; points: number; keywords: string[]; keywords_min: number | null; explanation: string; options: Opt[] }
interface TestData { title: string; time_limit_min: number | null; max_attempts: number; shuffle_questions: boolean; questions: Q[] }

const TYPE_LABEL: Record<QType, string> = { single: 'Один ответ', multi: 'Несколько ответов', order: 'Порядок', open: 'Открытый ответ' };
const key = () => Math.random().toString(36).slice(2);

function blank(type: QType): Q {
  const opts = type === 'open' ? [] : [{ text: '', is_correct: type === 'single' }, { text: '', is_correct: false }, { text: '', is_correct: false }];
  return { key: key(), type, body: '', points: type === 'order' || type === 'multi' ? 2 : 1, keywords: [], keywords_min: type === 'open' ? 1 : null, explanation: '', options: opts };
}

export function validateQ(q: Q, i: number): string | null {
  if (!q.body.trim()) return `Вопрос ${i}: пустой текст`;
  if (q.type !== 'open') {
    if (q.options.filter((o) => o.text.trim()).length < 2) return `Вопрос ${i}: нужно минимум 2 варианта`;
    if (q.options.some((o) => !o.text.trim())) return `Вопрос ${i}: есть пустой вариант`;
  }
  const c = q.options.filter((o) => o.is_correct).length;
  if (q.type === 'single' && c !== 1) return `Вопрос ${i}: в одиночном выборе ровно 1 верный вариант`;
  if (q.type === 'multi' && c < 1) return `Вопрос ${i}: отметьте хотя бы один верный вариант`;
  if (q.type === 'open' && !q.keywords.length) return `Вопрос ${i}: добавьте ключевые слова`;
  return null;
}

export default function TestBuilder() {
  const { courseId } = useParams();
  const { t } = useTranslation();
  const [d, setD] = useState<TestData | null>(null);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [preview, setPreview] = useState(false);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [course, setCourse] = useState<{ title: string } | null>(null);

  useEffect(() => {
    void api(`/api/courses/${courseId}`).then(setCourse);
    void api<any>(`/api/courses/${courseId}/test`).then((r) => {
      if (!r) setD({ title: 'Итоговый тест', time_limit_min: 15, max_attempts: 3, shuffle_questions: false, questions: [] });
      else setD({ ...r, questions: r.questions.map((q: any) => ({ ...q, key: q.id, explanation: q.explanation || '', keywords: q.keywords || [], options: q.options.map((o: any) => ({ id: o.id, text: o.text, is_correct: o.is_correct })) })) });
    });
  }, [courseId]);

  if (!d) return <Spinner />;
  const setQ = (i: number, q: Partial<Q>) => setD({ ...d, questions: d.questions.map((x, k) => (k === i ? { ...x, ...q } : x)) });
  const moveQ = (i: number, dir: -1 | 1) => {
    const qs = [...d.questions];
    const j = i + dir;
    if (j < 0 || j >= qs.length) return;
    [qs[i], qs[j]] = [qs[j], qs[i]];
    setD({ ...d, questions: qs });
  };
  const errors = d.questions.map((q, i) => validateQ(q, i + 1)).filter(Boolean) as string[];

  const save = async () => {
    setMsg(null);
    if (errors.length) {
      setMsg({ kind: 'error', text: errors[0] });
      return;
    }
    try {
      const r = await api<any>(`/api/courses/${courseId}/test`, {
        method: 'PUT',
        body: { ...d, questions: d.questions.map((q) => ({ id: q.id, type: q.type, body: q.body, points: q.points, keywords: q.keywords, keywords_min: q.keywords_min, explanation: q.explanation || null, options: q.options.map((o) => ({ id: o.id, text: o.text, is_correct: o.is_correct })) })) },
      });
      setD({ ...r, questions: r.questions.map((q: any) => ({ ...q, key: q.id, explanation: q.explanation || '', keywords: q.keywords || [], options: q.options.map((o: any) => ({ id: o.id, text: o.text, is_correct: o.is_correct })) })) });
      setMsg({ kind: 'success', text: t('Тест сохранён. Чтобы сотрудники получили изменения, опубликуйте новую версию курса.') });
    } catch (e) {
      setMsg({ kind: 'error', text: errorText(e) });
    }
  };

  return (
    <div className="max-w-4xl pb-10">
      <Link to={`/m/courses/${courseId}`} className="text-brand-700 font-medium min-h-tap inline-flex items-center"><Icon name="left" />{course?.title}</Link>
      <PageTitle actions={<>
        <Button variant="secondary" icon={preview ? 'edit' : 'play'} onClick={() => setPreview(!preview)}>{preview ? t('Редактор') : t('Превью глазами сотрудника')}</Button>
        <Button icon="check" onClick={() => void save()}>{t('Сохранить тест')}</Button>
      </>}>{t('Конструктор теста')}</PageTitle>
      {msg && <div className="mb-3"><Alert kind={msg.kind}>{msg.text}</Alert></div>}

      {preview ? (
        <div className="space-y-4 max-w-2xl">
          {d.questions.map((q, i) => (
            <Card key={q.key} className="p-5">
              <div className="text-sm text-slate-500 mb-2">{t('Вопрос')} {i + 1} · {q.points} {t('балл.')}</div>
              <QuestionRenderer q={{ id: q.key, type: q.type, body: q.body, options: (q.type === 'order' ? [...q.options].reverse() : q.options).map((o, k) => ({ id: o.id || `${q.key}-${k}`, text: o.text })) }}
                answer={answers[q.key]} onChange={(a) => setAnswers({ ...answers, [q.key]: a })} />
            </Card>
          ))}
        </div>
      ) : (
        <>
          <Card className="p-4 mb-4 grid sm:grid-cols-4 gap-x-3">
            <div className="sm:col-span-4"><Field label={t('Название теста')}><input className={inputCls} value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} /></Field></div>
            <Field label={t('Время, мин (пусто — без лимита)')}><input type="number" min={1} className={inputCls} value={d.time_limit_min ?? ''} onChange={(e) => setD({ ...d, time_limit_min: e.target.value ? Number(e.target.value) : null })} /></Field>
            <Field label={t('Попыток')}><input type="number" min={1} max={20} className={inputCls} value={d.max_attempts} onChange={(e) => setD({ ...d, max_attempts: Number(e.target.value) })} /></Field>
            <label className="flex items-center gap-2 sm:col-span-2 min-h-tap mt-6"><input type="checkbox" className="w-6 h-6" checked={d.shuffle_questions} onChange={(e) => setD({ ...d, shuffle_questions: e.target.checked })} />{t('Перемешивать вопросы')}</label>
          </Card>
          <div className="space-y-3">
            {d.questions.map((q, i) => (
              <QuestionEditor key={q.key} q={q} i={i} total={d.questions.length} onChange={(p) => setQ(i, p)} onMove={(dir) => moveQ(i, dir)}
                onDelete={() => setD({ ...d, questions: d.questions.filter((_, k) => k !== i) })} error={validateQ(q, i + 1)} />
            ))}
          </div>
          <Card className="p-4 mt-4">
            <div className="font-semibold mb-2">{t('Добавить вопрос')}</div>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(TYPE_LABEL) as QType[]).map((tp) => <Button key={tp} variant="secondary" icon="plus" onClick={() => setD({ ...d, questions: [...d.questions, blank(tp)] })}>{t(TYPE_LABEL[tp])}</Button>)}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function QuestionEditor({ q, i, total, onChange, onMove, onDelete, error }: { q: Q; i: number; total: number; onChange: (p: Partial<Q>) => void; onMove: (d: -1 | 1) => void; onDelete: () => void; error: string | null }) {
  const { t } = useTranslation();
  const [kw, setKw] = useState('');
  const setOpt = (k: number, p: Partial<Opt>) => onChange({ options: q.options.map((o, j) => (j === k ? { ...o, ...p } : q.type === 'single' && p.is_correct ? { ...o, is_correct: false } : o)) });
  const moveOpt = (k: number, dir: -1 | 1) => {
    const o = [...q.options];
    const j = k + dir;
    if (j < 0 || j >= o.length) return;
    [o[k], o[j]] = [o[j], o[k]];
    onChange({ options: o });
  };
  const addKw = () => {
    const words = kw.split(/[,;\s]+/).map((w) => w.trim()).filter(Boolean);
    if (words.length) onChange({ keywords: [...new Set([...q.keywords, ...words])] });
    setKw('');
  };
  return (
    <Card className={`p-4 ${error ? 'border-amber-300' : ''}`}>
      <div className="flex items-center gap-2 mb-3">
        <Badge color="teal">{i + 1}</Badge>
        <Badge color="blue">{t(TYPE_LABEL[q.type])}</Badge>
        <div className="flex-1" />
        <button className="min-h-tap min-w-tap rounded-lg hover:bg-slate-100 disabled:opacity-30" disabled={i === 0} onClick={() => onMove(-1)}><Icon name="up" className="mx-auto" /></button>
        <button className="min-h-tap min-w-tap rounded-lg hover:bg-slate-100 disabled:opacity-30" disabled={i === total - 1} onClick={() => onMove(1)}><Icon name="down" className="mx-auto" /></button>
        <button className="min-h-tap min-w-tap rounded-lg hover:bg-red-50 text-red-600" onClick={onDelete}><Icon name="trash" className="mx-auto" /></button>
      </div>
      <Field label={t('Текст вопроса')}><textarea className={inputCls} rows={2} value={q.body} onChange={(e) => onChange({ body: e.target.value })} /></Field>
      {q.type !== 'open' && (
        <div className="mb-3">
          <div className="text-sm font-semibold text-slate-700 mb-1">
            {q.type === 'order' ? t('Варианты в ПРАВИЛЬНОМ порядке (сотрудник увидит их перемешанными)') : q.type === 'single' ? t('Варианты — отметьте один верный') : t('Варианты — отметьте все верные')}
          </div>
          <div className="space-y-2">
            {q.options.map((o, k) => (
              <div key={k} className="flex items-center gap-2">
                {q.type === 'order' ? <span className="w-8 text-center font-bold text-slate-500">{k + 1}</span> : (
                  <input type={q.type === 'single' ? 'radio' : 'checkbox'} className="w-6 h-6 shrink-0" checked={o.is_correct} onChange={(e) => setOpt(k, { is_correct: e.target.checked })} />
                )}
                <input className={inputCls} value={o.text} onChange={(e) => setOpt(k, { text: e.target.value })} placeholder={`${t('Вариант')} ${k + 1}`} />
                {q.type === 'order' && <>
                  <button className="min-w-[40px] min-h-tap rounded-lg hover:bg-slate-100" onClick={() => moveOpt(k, -1)}><Icon name="up" className="mx-auto" /></button>
                  <button className="min-w-[40px] min-h-tap rounded-lg hover:bg-slate-100" onClick={() => moveOpt(k, 1)}><Icon name="down" className="mx-auto" /></button>
                </>}
                <button className="min-w-[40px] min-h-tap rounded-lg hover:bg-red-50 text-red-600" onClick={() => onChange({ options: q.options.filter((_, j) => j !== k) })}><Icon name="x" className="mx-auto" /></button>
              </div>
            ))}
          </div>
          <Button variant="ghost" icon="plus" onClick={() => onChange({ options: [...q.options, { text: '', is_correct: false }] })}>{t('Вариант')}</Button>
        </div>
      )}
      {q.type === 'open' && (
        <div className="mb-3">
          <div className="text-sm font-semibold text-slate-700 mb-1">{t('Ключевые слова (засчитывается по основе слова: «мастер» найдёт «мастеру»)')}</div>
          <div className="flex flex-wrap gap-2 mb-2">
            {q.keywords.map((k) => (
              <span key={k} className="inline-flex items-center gap-1 bg-brand-100 text-brand-800 rounded-full pl-3 pr-1 py-1">
                {k}<button className="w-7 h-7 rounded-full hover:bg-brand-200" onClick={() => onChange({ keywords: q.keywords.filter((x) => x !== k) })}>×</button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input className={inputCls} value={kw} onChange={(e) => setKw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addKw())} placeholder={t('слово, слово…')} />
            <Button variant="secondary" onClick={addKw}>{t('Добавить')}</Button>
          </div>
          <Field label={t('Минимум совпадений для автозачёта (иначе — на проверку методисту)')}>
            <input type="number" min={1} className={`${inputCls} w-32`} value={q.keywords_min ?? 1} onChange={(e) => onChange({ keywords_min: Number(e.target.value) })} />
          </Field>
        </div>
      )}
      <div className="grid sm:grid-cols-4 gap-x-3">
        <Field label={t('Баллы')}><input type="number" min={0.5} step={0.5} className={inputCls} value={q.points} onChange={(e) => onChange({ points: Number(e.target.value) })} /></Field>
        <div className="sm:col-span-3"><Field label={t('Пояснение (показывается после сдачи)')}><input className={inputCls} value={q.explanation} onChange={(e) => onChange({ explanation: e.target.value })} /></Field></div>
      </div>
      {error && <div className="text-sm text-amber-700">⚠ {error}</div>}
    </Card>
  );
}

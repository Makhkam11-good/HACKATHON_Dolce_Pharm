import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, errorText, saveBlob } from '../../api/client';
import { Icon } from '../../components/Icon';
import { maxScore, ScenarioPlayer } from '../../components/ScenarioPlayer';
import { Alert, Badge, Button, Card, Empty, Field, inputCls, PageTitle, Spinner } from '../../components/ui';
import type { Emotion, Scenario, ScenarioData, ScenarioNode } from '../../types';
import type { CourseRow } from './Courses';

const EMOTIONS: Emotion[] = ['calm', 'worried', 'angry', 'scared', 'happy'];
const EMO_RU: Record<Emotion, string> = { calm: 'спокойствие', worried: 'тревога', angry: 'гнев', scared: 'страх', happy: 'радость' };
const BGS = ['workshop', 'corridor', 'lab', 'alarm'];
const BG_RU: Record<string, string> = { workshop: 'цех', corridor: 'коридор', lab: 'лаборатория', alarm: 'тревога' };

const EMPTY: ScenarioData = {
  characters: { master: { name: 'Мастер смены' } }, backgrounds: BGS, start: 'n1',
  nodes: { n1: { speaker: 'master', emotion: 'calm', background: 'workshop', text: 'Начало ситуации…', choices: [{ text: 'Вариант', next: 'end1', score: 1 }] }, end1: { speaker: 'master', emotion: 'happy', background: 'corridor', text: 'Финал', end: true, feedback: '' } },
};

export default function Scenarios() {
  const { t } = useTranslation();
  const [list, setList] = useState<Scenario[] | null>(null);
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [cur, setCur] = useState<Scenario | null>(null);
  const [preview, setPreview] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const load = () => void api<Scenario[]>('/api/scenarios').then(setList);
  useEffect(() => {
    load();
    void api<CourseRow[]>('/api/courses').then(setCourses);
  }, []);

  const save = async () => {
    if (!cur) return;
    setMsg(null);
    try {
      const body = { title: cur.title, description: cur.description, course_id: cur.course_id, data: cur.data };
      const s = cur.id ? await api<Scenario>(`/api/scenarios/${cur.id}`, { method: 'PUT', body }) : await api<Scenario>('/api/scenarios', { body });
      setCur(s);
      setMsg({ kind: 'success', text: t('Сценарий сохранён') });
      load();
    } catch (e) {
      setMsg({ kind: 'error', text: errorText(e) });
    }
  };

  const importJson = async (f: File) => {
    try {
      const j = JSON.parse(await f.text());
      const data: ScenarioData = j.data || j;
      if (!data.nodes || !data.start) throw new Error(t('В JSON нет nodes/start'));
      setCur({ id: '', title: j.title || f.name.replace(/\.json$/i, ''), description: j.description || '', course_id: null, data });
      setPreview(false);
    } catch (e) {
      setMsg({ kind: 'error', text: `${t('Не удалось прочитать JSON')}: ${errorText(e)}` });
    }
  };

  if (!list) return <Spinner />;
  if (!cur) {
    return (
      <div className="max-w-3xl">
        <PageTitle actions={<>
          <input ref={fileInput} type="file" accept=".json,application/json" className="hidden" onChange={(e) => e.target.files?.[0] && void importJson(e.target.files[0])} />
          <Button variant="secondary" icon="upload" onClick={() => fileInput.current?.click()}>{t('Загрузить JSON')}</Button>
          <Button icon="plus" onClick={() => setCur({ id: '', title: t('Новый сценарий'), description: '', course_id: null, data: structuredClone(EMPTY) })}>{t('Новый')}</Button>
        </>}>{t('Тренажёры')}</PageTitle>
        {msg && <div className="mb-3"><Alert kind={msg.kind}>{msg.text}</Alert></div>}
        {!list.length && <Empty icon="chat">{t('Сценариев пока нет')}</Empty>}
        <div className="space-y-2">
          {list.map((s) => (
            <Card key={s.id} className="p-4 flex items-center gap-3" onClick={() => { setCur(s); setPreview(false); setMsg(null); }}>
              <Icon name="chat" className="text-brand-700" />
              <div className="flex-1"><div className="font-semibold">{s.title}</div><div className="text-sm text-slate-500">{Object.keys(s.data.nodes).length} {t('узлов')} · {t('макс. балл')} {maxScore(s.data)} · {courses.find((c) => c.id === s.course_id)?.title || t('без курса')}</div></div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const d = cur.data;
  const setData = (data: ScenarioData) => setCur({ ...cur, data });
  const setNode = (id: string, n: ScenarioNode) => setData({ ...d, nodes: { ...d.nodes, [id]: n } });
  const ids = Object.keys(d.nodes);
  const addNode = () => {
    let i = ids.length + 1;
    while (d.nodes[`n${i}`]) i++;
    setNode(`n${i}`, { speaker: 'master', emotion: 'calm', background: 'workshop', text: '', choices: [] });
  };
  const removeNode = (id: string) => {
    const nodes = { ...d.nodes };
    delete nodes[id];
    setData({ ...d, nodes });
  };

  return (
    <div className="max-w-4xl pb-10">
      <button className="text-brand-700 font-medium min-h-tap flex items-center" onClick={() => setCur(null)}><Icon name="left" />{t('Тренажёры')}</button>
      <PageTitle actions={<>
        <Button variant="secondary" icon="download" onClick={() => saveBlob(new Blob([JSON.stringify({ title: cur.title, description: cur.description, data: d }, null, 2)], { type: 'application/json' }), `${cur.title}.json`)}>JSON</Button>
        <Button variant="secondary" icon={preview ? 'edit' : 'play'} onClick={() => setPreview(!preview)}>{preview ? t('Редактор') : t('Превью')}</Button>
        <Button icon="check" onClick={() => void save()}>{t('Сохранить')}</Button>
      </>}>{cur.title}</PageTitle>
      {msg && <div className="mb-3"><Alert kind={msg.kind}>{msg.text}</Alert></div>}
      {preview ? <ScenarioPlayer key={JSON.stringify(d).length} scenario={cur} /> : (
        <>
          <Card className="p-4 mb-4 grid sm:grid-cols-2 gap-x-3">
            <Field label={t('Название')}><input className={inputCls} value={cur.title} onChange={(e) => setCur({ ...cur, title: e.target.value })} /></Field>
            <Field label={t('Курс')}>
              <select className={inputCls} value={cur.course_id || ''} onChange={(e) => setCur({ ...cur, course_id: e.target.value || null })}>
                <option value="">—</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </Field>
            <div className="sm:col-span-2"><Field label={t('Описание')}><input className={inputCls} value={cur.description} onChange={(e) => setCur({ ...cur, description: e.target.value })} /></Field></div>
            <Field label={t('Стартовый узел')}>
              <select className={inputCls} value={d.start} onChange={(e) => setData({ ...d, start: e.target.value })}>{ids.map((id) => <option key={id}>{id}</option>)}</select>
            </Field>
            <Field label={t('Имя персонажа')}><input className={inputCls} value={d.characters?.master?.name || ''} onChange={(e) => setData({ ...d, characters: { ...d.characters, master: { name: e.target.value } } })} /></Field>
          </Card>
          <div className="space-y-3">
            {ids.map((id) => {
              const n = d.nodes[id];
              return (
                <Card key={id} className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge color={n.end ? 'amber' : 'teal'}>{id}</Badge>
                    {id === d.start && <Badge color="blue">{t('старт')}</Badge>}
                    <div className="flex-1" />
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="w-5 h-5" checked={!!n.end} onChange={(e) => setNode(id, { ...n, end: e.target.checked, choices: e.target.checked ? [] : n.choices || [] })} />{t('концовка')}</label>
                    <button className="min-h-tap min-w-tap text-red-600 rounded-lg hover:bg-red-50" onClick={() => removeNode(id)}><Icon name="trash" className="mx-auto" /></button>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-x-3">
                    <Field label={t('Эмоция')}><select className={inputCls} value={n.emotion || 'calm'} onChange={(e) => setNode(id, { ...n, emotion: e.target.value as Emotion })}>{EMOTIONS.map((x) => <option key={x} value={x}>{t(EMO_RU[x])}</option>)}</select></Field>
                    <Field label={t('Фон')}><select className={inputCls} value={n.background || 'workshop'} onChange={(e) => setNode(id, { ...n, background: e.target.value })}>{BGS.map((x) => <option key={x} value={x}>{t(BG_RU[x])}</option>)}</select></Field>
                  </div>
                  <Field label={t('Реплика')}><textarea className={inputCls} rows={2} value={n.text} onChange={(e) => setNode(id, { ...n, text: e.target.value })} /></Field>
                  {n.end ? (
                    <Field label={t('Обратная связь')}><textarea className={inputCls} rows={2} value={n.feedback || ''} onChange={(e) => setNode(id, { ...n, feedback: e.target.value })} /></Field>
                  ) : (
                    <div>
                      <div className="text-sm font-semibold mb-1">{t('Варианты ответа')}</div>
                      {(n.choices || []).map((c, k) => (
                        <div key={k} className="flex flex-wrap sm:flex-nowrap gap-2 mb-2">
                          <input className={inputCls} value={c.text} placeholder={t('Текст варианта')} onChange={(e) => setNode(id, { ...n, choices: n.choices!.map((x, j) => (j === k ? { ...x, text: e.target.value } : x)) })} />
                          <select className={`${inputCls} sm:w-40`} value={c.next} onChange={(e) => setNode(id, { ...n, choices: n.choices!.map((x, j) => (j === k ? { ...x, next: e.target.value } : x)) })}>{ids.map((x) => <option key={x}>{x}</option>)}</select>
                          <input type="number" className={`${inputCls} sm:w-24`} value={c.score} title={t('Баллы')} onChange={(e) => setNode(id, { ...n, choices: n.choices!.map((x, j) => (j === k ? { ...x, score: Number(e.target.value) } : x)) })} />
                          <button className="min-h-tap min-w-tap text-red-600" onClick={() => setNode(id, { ...n, choices: n.choices!.filter((_, j) => j !== k) })}><Icon name="x" className="mx-auto" /></button>
                        </div>
                      ))}
                      <Button variant="ghost" icon="plus" onClick={() => setNode(id, { ...n, choices: [...(n.choices || []), { text: '', next: ids[0], score: 0 }] })}>{t('Вариант')}</Button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
          <Button variant="secondary" icon="plus" className="mt-3" onClick={addNode}>{t('Добавить узел')}</Button>
        </>
      )}
    </div>
  );
}

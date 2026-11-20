import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { api, errorText } from '../../api/client';
import { useAuth } from '../../auth';
import { Alert, Button, Card, Field, fmtDate, inputCls, PageTitle, Spinner } from '../../components/ui';
import type { Department, User } from '../../types';
import type { CourseRow } from './Courses';

interface Asg { id: string; course_id: string; user_id: string; due_date: string | null; full_name: string; department_name: string | null }

export default function Assignments() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [courseId, setCourseId] = useState(params.get('course') || '');
  const [users, setUsers] = useState<User[]>([]);
  const [depts, setDepts] = useState<Department[]>([]);
  const [list, setList] = useState<Asg[] | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [dept, setDept] = useState('');
  const [due, setDue] = useState('');
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    void api<CourseRow[]>('/api/courses').then((cs) => {
      setCourses(cs);
      if (!courseId && cs.length) setCourseId(cs[0].id);
    });
    void api<User[]>('/api/users?role=employee').then(setUsers);
    void api<Department[]>('/api/departments').then(setDepts);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const loadList = () => courseId && void api<Asg[]>(`/api/assignments?course_id=${courseId}`).then(setList);
  useEffect(() => void loadList(), [courseId]); // eslint-disable-line react-hooks/exhaustive-deps

  const assigned = new Set((list || []).map((a) => a.user_id));
  const shown = users.filter((u) => (!dept || u.department_id === dept) && (!q || u.full_name.toLowerCase().includes(q.toLowerCase())));
  const course = courses.find((c) => c.id === courseId);

  const submit = async (byDept: boolean) => {
    setMsg(null);
    try {
      const r = await api<{ assigned: number }>('/api/assignments', {
        body: { course_id: courseId, user_ids: byDept ? null : [...sel], department_id: byDept ? dept || user?.department_id : null, due_date: due || null },
      });
      setMsg({ kind: 'success', text: `${t('Назначено')}: ${r.assigned}` });
      setSel(new Set());
      loadList();
    } catch (e) {
      setMsg({ kind: 'error', text: errorText(e) });
    }
  };

  return (
    <div>
      <PageTitle>{t('Назначения курсов')}</PageTitle>
      <Card className="p-4 mb-4">
        <div className="grid sm:grid-cols-3 gap-x-3">
          <Field label={t('Курс')}>
            <select className={inputCls} value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.title}{c.status !== 'published' ? ` (${t('черновик')})` : ''}</option>)}
            </select>
          </Field>
          <Field label={t('Подразделение')}>
            <select className={inputCls} value={dept} onChange={(e) => setDept(e.target.value)}>
              <option value="">{t('Все')}</option>
              {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <Field label={t('Срок')}><input type="date" className={inputCls} value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        </div>
        {course?.status !== 'published' && <div className="mb-3"><Alert kind="warn">{t('Курс не опубликован — сотрудники увидят его после публикации.')}</Alert></div>}
        <div className="flex flex-wrap gap-2">
          <Button icon="users" disabled={!sel.size || !courseId} onClick={() => void submit(false)}>{t('Назначить выбранным')} ({sel.size})</Button>
          <Button variant="secondary" disabled={!courseId || (!dept && user?.role !== 'manager')} onClick={() => void submit(true)}>{t('Назначить всему подразделению')}</Button>
        </div>
        {msg && <div className="mt-3"><Alert kind={msg.kind}>{msg.text}</Alert></div>}
      </Card>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="font-semibold flex-1">{t('Сотрудники')}</div>
            <input className={`${inputCls} w-48`} placeholder={t('Поиск')} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 py-1 text-sm text-slate-600">
            <input type="checkbox" className="w-5 h-5" onChange={(e) => setSel(e.target.checked ? new Set(shown.filter((u) => !assigned.has(u.id)).map((u) => u.id)) : new Set())} />{t('Выбрать всех без назначения')}
          </label>
          <div className="max-h-[420px] overflow-auto divide-y">
            {shown.map((u) => (
              <label key={u.id} className="flex items-center gap-3 py-2 min-h-tap">
                <input type="checkbox" className="w-5 h-5" checked={sel.has(u.id)} disabled={assigned.has(u.id)}
                  onChange={(e) => { const s = new Set(sel); if (e.target.checked) s.add(u.id); else s.delete(u.id); setSel(s); }} />
                <span className="flex-1">{u.full_name}<span className="block text-xs text-slate-500">{u.position} · {u.department_name}</span></span>
                {assigned.has(u.id) && <span className="text-xs text-emerald-700 font-semibold">{t('назначен')}</span>}
              </label>
            ))}
          </div>
        </Card>
        <Card className="p-4">
          <div className="font-semibold mb-2">{t('Уже назначено')}: {list?.length ?? 0}</div>
          {!list ? <Spinner /> : (
            <div className="max-h-[460px] overflow-auto divide-y">
              {list.map((a) => (
                <div key={a.id} className="flex items-center gap-2 py-2">
                  <span className="flex-1">{a.full_name}<span className="block text-xs text-slate-500">{a.department_name}{a.due_date ? ` · ${t('до')} ${fmtDate(a.due_date, false)}` : ''}</span></span>
                  <Button variant="ghost" icon="x" onClick={() => void api(`/api/assignments/${a.id}`, { method: 'DELETE' }).then(loadList)} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

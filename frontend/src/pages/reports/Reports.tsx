import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, download, errorText } from '../../api/client';
import { useAuth } from '../../auth';
import { BarChart } from '../../components/Charts';
import { Alert, Button, Card, Field, inputCls, PageTitle, Spinner } from '../../components/ui';
import type { Department, ReportData, User } from '../../types';
import type { CourseRow } from '../methodist/Courses';

const TABS = [
  ['summary', 'Сводка'],
  ['sessions', 'Вход и выход'],
  ['materials-time', 'Время по материалам'],
  ['attestation', 'Аттестация'],
  ['sync', 'Синхронизация'],
] as const;

export function ReportTable({ data, max = 500 }: { data: ReportData; max?: number }) {
  const { t } = useTranslation();
  if (!data.rows.length) return <div className="text-center text-slate-500 py-8">{t('Нет данных за выбранный период')}</div>;
  return (
    <div className="overflow-auto bg-white border rounded-2xl max-h-[70vh]">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left sticky top-0"><tr>{data.columns.map((c) => <th key={c.key} className="p-2.5 whitespace-nowrap">{t(c.title)}</th>)}</tr></thead>
        <tbody>
          {data.rows.slice(0, max).map((r, i) => (
            <tr key={i} className="border-t hover:bg-slate-50">
              {data.columns.map((c) => {
                const v = r[c.key];
                const s = v == null ? '' : String(v);
                const tone = s === 'сдал' || s.includes('✓') ? 'text-emerald-700 font-semibold' : s === 'не сдал' || s === '> 60 с' ? 'text-red-700 font-semibold' : s === 'на проверке' ? 'text-amber-700' : s === 'QR' ? 'text-sky-700 font-semibold' : '';
                return <td key={c.key} className={`p-2.5 whitespace-nowrap ${tone}`}>{s}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Reports() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('summary');
  const [f, setF] = useState({ from: '', to: '', department_id: '', user_id: '', course_id: '' });
  const [data, setData] = useState<ReportData | null>(null);
  const [depts, setDepts] = useState<Department[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    void api<Department[]>('/api/departments').then(setDepts);
    void api<User[]>('/api/users').then(setUsers);
    void api<CourseRow[]>('/api/courses').then(setCourses);
  }, []);

  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  useEffect(() => {
    setData(null);
    setErr('');
    api<ReportData>(`/api/reports/${tab}?${qs}`).then(setData).catch((e) => setErr(errorText(e)));
  }, [tab, qs]);

  // авто-обновление, чтобы на демо было видно, как данные приходят после включения сети
  useEffect(() => {
    const iv = setInterval(() => void api<ReportData>(`/api/reports/${tab}?${qs}`).then(setData).catch(() => undefined), 5000);
    return () => clearInterval(iv);
  }, [tab, qs]);

  const cards = data?.cards;
  return (
    <div>
      <PageTitle actions={<>
        <Button variant="secondary" icon="download" onClick={() => void download(`/api/reports/${tab}/export?format=xlsx&${qs}`, `${tab}.xlsx`)}>Excel</Button>
        <Button variant="secondary" icon="download" onClick={() => void download(`/api/reports/${tab}/export?format=csv&${qs}`, `${tab}.csv`)}>CSV</Button>
      </>} sub={user?.role === 'manager' ? `${t('Подразделение')}: ${user.department_name}` : undefined}>{t('Отчёты')}</PageTitle>
      <div className="flex gap-1 overflow-x-auto mb-3 pb-1">
        {TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`whitespace-nowrap rounded-xl px-4 min-h-tap font-semibold ${tab === k ? 'bg-brand-600 text-white' : 'bg-white border text-slate-700'}`}>{t(l)}</button>)}
      </div>
      <Card className="p-3 mb-4 grid grid-cols-2 lg:grid-cols-5 gap-x-3">
        <Field label={t('С')}><input type="date" className={inputCls} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
        <Field label={t('По')}><input type="date" className={inputCls} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
        {user?.role !== 'manager' && (
          <Field label={t('Подразделение')}><select className={inputCls} value={f.department_id} onChange={(e) => setF({ ...f, department_id: e.target.value })}><option value="">{t('Все')}</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
        )}
        <Field label={t('Сотрудник')}><select className={inputCls} value={f.user_id} onChange={(e) => setF({ ...f, user_id: e.target.value })}><option value="">{t('Все')}</option>{users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select></Field>
        <Field label={t('Курс')}><select className={inputCls} value={f.course_id} onChange={(e) => setF({ ...f, course_id: e.target.value })}><option value="">{t('Все')}</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></Field>
      </Card>
      {err && <Alert kind="error">{err}</Alert>}
      {!data ? <Spinner /> : (
        <>
          {tab === 'summary' && cards && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-4">
                {[['assigned', 'Назначено'], ['passed', 'Сдано'], ['failed', 'Не сдано'], ['pending_review', 'На проверке'], ['overdue', 'Просрочено'], ['avg_time_per_course', 'Среднее время на курс']].map(([k, l]) => (
                  <Card key={k} className="p-4"><div className="text-sm text-slate-500">{t(l)}</div><div className={`text-3xl font-black ${k === 'overdue' || k === 'failed' ? 'text-red-600' : k === 'passed' ? 'text-emerald-600' : ''}`}>{String(cards[k])}</div></Card>
                ))}
              </div>
              <Card className="p-4 mb-4">
                <BarChart stacked labels={(data.by_department || []).map((d) => String(d.department))} series={[
                  { label: t('Сдано'), data: (data.by_department || []).map((d) => Number(d.passed)), color: '#16a34a' },
                  { label: t('На проверке'), data: (data.by_department || []).map((d) => Number(d.pending_review)), color: '#f59e0b' },
                  { label: t('Не сдано'), data: (data.by_department || []).map((d) => Number(d.failed)), color: '#dc2626' },
                  { label: t('Не начато / в процессе'), data: (data.by_department || []).map((d) => Number(d.assigned) - Number(d.passed) - Number(d.failed) - Number(d.pending_review)), color: '#94a3b8' },
                ]} />
              </Card>
            </>
          )}
          {tab === 'sync' && <div className="mb-3"><Alert kind="info">{t('Колонка «Задержка после появления сети» — время от момента, когда телефон увидел сеть, до записи данных на сервер. Требование кейса — не более 60 секунд.')}</Alert></div>}
          <ReportTable data={data} />
        </>
      )}
    </div>
  );
}

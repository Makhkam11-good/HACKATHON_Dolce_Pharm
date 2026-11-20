import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, download, errorText } from '../../api/client';
import { useAuth } from '../../auth';
import { BarChart } from '../../components/Charts';
import { Icon, type IconName } from '../../components/Icon';
import { Alert, Button, Card, EmptyState, Field, inputCls, PageTitle, Spinner } from '../../components/ui';
import type { Department, ReportData, User } from '../../types';
import type { CourseRow } from '../methodist/Courses';

const TABS = [
  ['summary', 'Сводка'],
  ['sessions', 'Вход и выход'],
  ['materials-time', 'Время по материалам'],
  ['attestation', 'Аттестация'],
  ['sync', 'Отправка данных'],
] as const;

export function ReportTable({ data, max = 500 }: { data: ReportData; max?: number }) {
  const { t } = useTranslation();
  if (!data.rows.length) return <EmptyState icon="chart" title={t('Нет данных')}>{t('За выбранный период ничего нет. Измените даты или фильтры.')}</EmptyState>;
  return (
    <div className="overflow-auto bg-white border border-slate-200 rounded-2xl max-h-[70vh]">
      <table className="w-full">
        <thead className="bg-slate-100 text-left sticky top-0"><tr>{data.columns.map((c) => <th key={c.key} className="px-3 py-3 whitespace-nowrap font-semibold text-slate-800">{t(c.title)}</th>)}</tr></thead>
        <tbody>
          {data.rows.slice(0, max).map((r, i) => (
            <tr key={i} className="border-t border-slate-200 hover:bg-brand-50/40">
              {data.columns.map((c) => {
                const v = r[c.key];
                const s = v == null ? '' : String(v);
                const tone = s === 'сдал' || s.includes('✓') ? 'text-emerald-700 font-semibold' : s === 'не сдал' || s === '> 60 с' ? 'text-red-700 font-semibold' : s === 'на проверке' ? 'text-amber-800 font-semibold' : s === 'QR' ? 'text-sky-700 font-semibold' : '';
                return <td key={c.key} className={`px-3 py-2.5 whitespace-nowrap ${tone}`}>{s}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const SUMMARY: [string, string, IconName, string][] = [
  ['assigned', 'Назначено', 'tasks', 'text-slate-900'],
  ['passed', 'Сдано', 'checkCircle', 'text-emerald-700'],
  ['failed', 'Не сдано', 'xCircle', 'text-red-700'],
  ['overdue', 'Просрочено', 'alert', 'text-amber-800'],
];

/** Крупные итоги над таблицей: назначено / сдано / не сдано / просрочено. */
function SummaryCards({ cards }: { cards: Record<string, unknown> }) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5" data-testid="report-cards">
      {SUMMARY.map(([k, l, ic, c]) => (
        <Card key={k} className="p-4">
          <div className="flex items-center gap-2 text-slate-700 font-semibold"><Icon name={ic} size={20} className={c} />{t(l)}</div>
          <div className={`text-3xl font-extrabold mt-1 ${c}`}>{String(cards[k] ?? 0)}</div>
        </Card>
      ))}
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
  const [summary, setSummary] = useState<ReportData | null>(null);

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
    const load = () => void api<ReportData>(`/api/reports/summary?${qs}`).then(setSummary).catch(() => undefined);
    load();
    const iv = setInterval(() => {
      load();
      void api<ReportData>(`/api/reports/${tab}?${qs}`).then(setData).catch(() => undefined);
    }, 5000);
    return () => clearInterval(iv);
  }, [tab, qs]);

  const cards = summary?.cards;
  return (
    <div>
      <PageTitle actions={<>
        <Button variant="secondary" icon="download" onClick={() => void download(`/api/reports/${tab}/export?format=xlsx&${qs}`, `${tab}.xlsx`)}>{t('Скачать Excel')}</Button>
        <Button variant="secondary" icon="download" onClick={() => void download(`/api/reports/${tab}/export?format=csv&${qs}`, `${tab}.csv`)}>{t('Скачать CSV')}</Button>
      </>} sub={user?.role === 'manager' ? `${t('Подразделение')}: ${user.department_name}` : undefined}>{t('Отчёты')}</PageTitle>
      {cards && <SummaryCards cards={cards} />}
      <Card className="p-3 mb-4 grid grid-cols-2 lg:grid-cols-5 gap-x-3">
        <Field label={t('С')}><input type="date" className={inputCls} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
        <Field label={t('По')}><input type="date" className={inputCls} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
        {user?.role !== 'manager' && (
          <Field label={t('Подразделение')}><select className={inputCls} value={f.department_id} onChange={(e) => setF({ ...f, department_id: e.target.value })}><option value="">{t('Все')}</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
        )}
        <Field label={t('Сотрудник')}><select className={inputCls} value={f.user_id} onChange={(e) => setF({ ...f, user_id: e.target.value })}><option value="">{t('Все')}</option>{users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select></Field>
        <Field label={t('Курс')}><select className={inputCls} value={f.course_id} onChange={(e) => setF({ ...f, course_id: e.target.value })}><option value="">{t('Все')}</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></Field>
      </Card>
      <div className="flex gap-2 overflow-x-auto mb-4 pb-1" role="tablist">
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`whitespace-nowrap rounded-xl px-4 min-h-tap font-semibold ${tab === k ? 'bg-brand-600 text-white' : 'bg-white border border-slate-300 text-slate-800 hover:border-brand-600'}`}>{t(l)}</button>)}
      </div>
      {err && <Alert kind="error">{err}</Alert>}
      {!data ? <Spinner /> : (
        <>
          {tab === 'summary' && cards && (
            <>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <Card className="p-4"><div className="text-slate-700 font-semibold">{t('Ответы ждут проверки')}</div><div className="text-2xl font-extrabold text-amber-800">{String(cards.pending_review ?? 0)}</div></Card>
                <Card className="p-4"><div className="text-slate-700 font-semibold">{t('Среднее время на курс')}</div><div className="text-2xl font-extrabold">{String(cards.avg_time_per_course ?? '')}</div></Card>
              </div>
              <Card className="p-4 mb-4">
                <BarChart stacked labels={(data.by_department || []).map((d) => String(d.department))} series={[
                  { label: t('Сдано'), data: (data.by_department || []).map((d) => Number(d.passed)), color: '#1B7D45' },
                  { label: t('На проверке'), data: (data.by_department || []).map((d) => Number(d.pending_review)), color: '#C98200' },
                  { label: t('Не сдано'), data: (data.by_department || []).map((d) => Number(d.failed)), color: '#C62828' },
                  { label: t('Не начато / в процессе'), data: (data.by_department || []).map((d) => Number(d.assigned) - Number(d.passed) - Number(d.failed) - Number(d.pending_review)), color: '#C9C4CF' },
                ]} />
              </Card>
            </>
          )}
          {tab === 'sync' && <div className="mb-3"><Alert kind="info">{t('«Задержка после появления сети» — сколько прошло от момента, когда у телефона появился интернет, до записи данных на сервер. Норма — не больше 60 секунд.')}</Alert></div>}
          <ReportTable data={data} />
        </>
      )}
    </div>
  );
}

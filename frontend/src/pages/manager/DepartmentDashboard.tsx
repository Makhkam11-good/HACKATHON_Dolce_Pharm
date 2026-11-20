import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api, download } from '../../api/client';
import { useAuth } from '../../auth';
import { Badge, Button, Card, inputCls, PageTitle, Spinner } from '../../components/ui';
import type { Department, ReportData } from '../../types';

interface Row { user_id: string; course_id: string; full_name: string; position: string; course: string; status: string; status_ru: string; best_score: number | null; overdue: boolean; due_date: string; department: string }
const CELL: Record<string, string> = { passed: 'bg-emerald-500 text-white', failed: 'bg-red-500 text-white', pending_review: 'bg-amber-400', in_progress: 'bg-sky-200', not_started: 'bg-slate-100 text-slate-500' };

export default function DepartmentDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const nav = useNavigate();
  const [dept, setDept] = useState(user?.department_id || '');
  const [depts, setDepts] = useState<Department[]>([]);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [summary, setSummary] = useState<ReportData | null>(null);
  const [days, setDays] = useState(30);

  useEffect(() => void api<Department[]>('/api/departments').then(setDepts), []);
  useEffect(() => {
    const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const qs = dept ? `department_id=${dept}` : '';
    const load = () => {
      void api<Row[]>(`/api/reports/attestation-data?${qs}`).then(setRows);
      void api<ReportData>(`/api/reports/summary?${qs}&from=${from}`).then(setSummary);
    };
    load();
    const iv = setInterval(load, 10000);
    return () => clearInterval(iv);
  }, [dept, days]);

  if (!rows || !summary) return <Spinner />;
  const people = [...new Map(rows.map((r) => [r.user_id, r])).values()];
  const courses = [...new Map(rows.map((r) => [r.course_id, r.course])).entries()];
  const cell = (uid: string, cid: string) => rows.find((r) => r.user_id === uid && r.course_id === cid);
  const overdue = rows.filter((r) => r.overdue);
  const failed = rows.filter((r) => r.status === 'failed');
  const c = summary.cards || {};

  return (
    <div>
      <PageTitle sub={depts.find((d) => d.id === dept)?.name || t('Все подразделения')} actions={<>
        {user?.role !== 'manager' && (
          <select className={`${inputCls} w-auto`} value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="">{t('Все подразделения')}</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        )}
        <Button variant="secondary" icon="users" onClick={() => nav('/m/assignments')}>{t('Назначить курс')}</Button>
      </>}>{t('Дашборд подразделения')}</PageTitle>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <Card className="p-4"><div className="text-sm text-slate-500">{t('Назначено')}</div><div className="text-3xl font-black">{String(c.assigned ?? 0)}</div></Card>
        <Card className="p-4"><div className="text-sm text-slate-500">{t('Сдано')}</div><div className="text-3xl font-black text-emerald-600">{String(c.passed ?? 0)}</div></Card>
        <Card className="p-4"><div className="text-sm text-slate-500">{t('Не сдано')}</div><div className="text-3xl font-black text-red-600">{String(c.failed ?? 0)}</div></Card>
        <Card className="p-4"><div className="text-sm text-slate-500">{t('Просрочено')}</div><div className="text-3xl font-black text-red-600">{String(c.overdue ?? 0)}</div></Card>
        <Card className="p-4">
          <div className="text-sm text-slate-500 flex items-center gap-1">{t('Время обучения за')}
            <select className="bg-transparent font-semibold" value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={7}>7 {t('дн.')}</option><option value={30}>30 {t('дн.')}</option><option value={365}>{t('год')}</option></select>
          </div>
          <div className="text-3xl font-black">{String(c.total_time ?? '00:00:00')}</div>
        </Card>
      </div>

      <Card className="p-4 mb-4 overflow-auto">
        <div className="font-bold mb-3">{t('Сотрудники × курсы')}</div>
        <table className="text-sm min-w-full">
          <thead><tr><th className="text-left p-2">{t('Сотрудник')}</th>{courses.map(([id, title]) => (
            <th key={id} className="p-2 text-left align-bottom min-w-[140px]">
              <div className="line-clamp-2">{title}</div>
              <button className="text-xs text-brand-700 underline font-normal" onClick={() => void download(`/api/protocols/attestation?course_id=${id}${dept ? `&department_id=${dept}` : ''}`, 'protocol.pdf')}>{t('протокол PDF')}</button>
            </th>
          ))}</tr></thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.user_id} className="border-t">
                <td className="p-2 whitespace-nowrap"><div className="font-medium">{p.full_name}</div><div className="text-xs text-slate-500">{p.position}</div></td>
                {courses.map(([cid]) => {
                  const r = cell(p.user_id, cid);
                  return <td key={cid} className="p-1">{r ? <div className={`rounded-lg px-2 py-1.5 text-center font-semibold ${CELL[r.status]} ${r.overdue ? 'ring-2 ring-red-600' : ''}`}>{t(r.status_ru)}{r.best_score != null ? ` · ${r.best_score}%` : ''}</div> : <span className="text-slate-300">—</span>}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap gap-2 mt-3 text-xs">{Object.entries({ passed: 'сдал', failed: 'не сдал', pending_review: 'на проверке', in_progress: 'в процессе', not_started: 'не начат' }).map(([k, l]) => <span key={k} className={`rounded px-2 py-1 ${CELL[k]}`}>{t(l)}</span>)}<span className="rounded px-2 py-1 ring-2 ring-red-600">{t('просрочено')}</span></div>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="font-bold mb-2">{t('Просрочки')} <Badge color="red">{overdue.length}</Badge></div>
          <ul className="divide-y text-sm">{overdue.slice(0, 15).map((r) => <li key={r.user_id + r.course_id} className="py-2"><b>{r.full_name}</b> — {r.course} <span className="text-red-700">({t('срок')} {r.due_date})</span></li>)}</ul>
        </Card>
        <Card className="p-4">
          <div className="font-bold mb-2">{t('Не сдали')} <Badge color="red">{failed.length}</Badge></div>
          <ul className="divide-y text-sm">{failed.slice(0, 15).map((r) => <li key={r.user_id + r.course_id} className="py-2"><b>{r.full_name}</b> — {r.course} ({r.best_score}%)</li>)}</ul>
        </Card>
      </div>
    </div>
  );
}

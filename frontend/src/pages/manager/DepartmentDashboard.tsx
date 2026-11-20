import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api, download } from '../../api/client';
import { useAuth } from '../../auth';
import { Icon, type IconName } from '../../components/Icon';
import { Button, Card, inputCls, PageTitle, Spinner, StatusBadge, type StatusKind } from '../../components/ui';
import type { Department, ReportData } from '../../types';

interface Row { user_id: string; course_id: string; full_name: string; position: string; course: string; status: string; status_ru: string; best_score: number | null; overdue: boolean; due_date: string; department: string }

/** Ячейка таблицы: светлый фон + тёмный текст + иконка (контраст AA, различимо без цвета). */
const CELL: Record<string, { cls: string; icon: IconName | 'circleDashed' }> = {
  passed: { cls: 'bg-emerald-100 text-emerald-800', icon: 'checkCircle' },
  failed: { cls: 'bg-red-100 text-red-800', icon: 'xCircle' },
  pending_review: { cls: 'bg-amber-100 text-amber-900', icon: 'clock' },
  in_progress: { cls: 'bg-sky-100 text-sky-800', icon: 'play' },
  not_started: { cls: 'bg-slate-100 text-[#555555]', icon: 'circleDashed' },
};
const PRIORITY: Record<string, number> = { failed: 1, pending_review: 3, in_progress: 2, not_started: 2, passed: 9 };

function Stat({ label, value, tone = 'ink', icon }: { label: string; value: string; tone?: 'ink' | 'ok' | 'err' | 'warn'; icon: IconName }) {
  const c = { ink: 'text-slate-900', ok: 'text-emerald-700', err: 'text-red-700', warn: 'text-amber-800' }[tone];
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-slate-700 font-semibold"><Icon name={icon} size={20} className={c} />{label}</div>
      <div className={`text-3xl font-extrabold mt-1 ${c}`}>{value}</div>
    </Card>
  );
}

export default function DepartmentDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const nav = useNavigate();
  const [dept, setDept] = useState(user?.department_id || '');
  const [depts, setDepts] = useState<Department[]>([]);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [summary, setSummary] = useState<ReportData | null>(null);
  const [days, setDays] = useState(30);
  const [showDone, setShowDone] = useState(false);

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
  const c = summary.cards || {};

  // кто не прошёл: у кого есть несданные курсы; просрочки — сверху
  const byPerson = people.map((p) => {
    const mine = rows.filter((r) => r.user_id === p.user_id);
    const open = mine.filter((r) => r.status !== 'passed')
      .sort((a, b) => Number(b.overdue) - Number(a.overdue) || (PRIORITY[a.status] ?? 5) - (PRIORITY[b.status] ?? 5));
    return { p, open, overdue: open.filter((r) => r.overdue).length, failed: open.filter((r) => r.status === 'failed').length };
  });
  const attention = byPerson.filter((x) => x.open.length)
    .sort((a, b) => b.overdue - a.overdue || b.failed - a.failed || b.open.length - a.open.length || a.p.full_name.localeCompare(b.p.full_name));
  const done = byPerson.filter((x) => !x.open.length);
  const kindOf = (r: Row): StatusKind => (r.status === 'failed' ? 'failed_final' : (r.status as StatusKind));

  return (
    <div>
      <PageTitle sub={depts.find((d) => d.id === dept)?.name || t('Все подразделения')} actions={<>
        {user?.role !== 'manager' && (
          <select className={`${inputCls} w-auto`} aria-label={t('Подразделение')} value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="">{t('Все подразделения')}</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        )}
        <Button variant="secondary" icon="tasks" onClick={() => nav('/m/assignments')}>{t('Назначить курс')}</Button>
      </>}>{t('Кто не прошёл обучение')}</PageTitle>

      <Button big icon="camera" className="md:hidden mb-4" onClick={() => nav('/qr-receive')}>{t('Принять результаты сотрудников')}</Button>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <Stat label={t('Назначено')} value={String(c.assigned ?? 0)} icon="tasks" />
        <Stat label={t('Сдано')} value={String(c.passed ?? 0)} tone="ok" icon="checkCircle" />
        <Stat label={t('Не сдано')} value={String(c.failed ?? 0)} tone="err" icon="xCircle" />
        <Stat label={t('Просрочено')} value={String(c.overdue ?? 0)} tone="warn" icon="alert" />
        <Card className="p-4 col-span-2 lg:col-span-1">
          <label className="flex items-center gap-2 text-slate-700 font-semibold flex-wrap">
            <Icon name="clock" size={20} />{t('Время обучения за')}
            <select className="bg-white border-2 border-slate-300 rounded-lg px-2 min-h-[40px] font-semibold" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={7}>7 {t('дн.')}</option><option value={30}>30 {t('дн.')}</option><option value={365}>{t('год')}</option>
            </select>
          </label>
          <div className="text-3xl font-extrabold mt-1">{String(c.total_time ?? '00:00:00')}</div>
        </Card>
      </div>

      <h2 className="text-xl font-bold mb-3">{t('Требуют внимания')}: {attention.length}</h2>
      {!attention.length && <Card className="p-5 mb-6"><StatusBadge status="passed" label={t('Все сотрудники прошли обучение')} /></Card>}
      <div className="grid md:grid-cols-2 gap-3 mb-6">
        {attention.map(({ p, open }) => (
          <Card key={p.user_id} className="p-4" >
            <div className="font-bold text-lg text-slate-900 leading-snug">{p.full_name}</div>
            <div className="text-slate-600 mb-3">{p.position}</div>
            <ul className="space-y-2">
              {open.map((r) => (
                <li key={r.course_id} className="flex flex-col gap-1">
                  <span className="font-semibold text-slate-800">{r.course}</span>
                  <span className="flex flex-wrap gap-2">
                    <StatusBadge status={kindOf(r)} label={`${t(r.status_ru)}${r.best_score != null ? ` · ${r.best_score}%` : ''}`} />
                    {r.overdue && <StatusBadge status="overdue" label={`${t('Срок прошёл')}: ${r.due_date}`} />}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
      {done.length > 0 && (
        <div className="mb-6">
          <Button variant="ghost" icon={showDone ? 'up' : 'down'} onClick={() => setShowDone((v) => !v)}>{t('Прошли всё обучение')}: {done.length}</Button>
          {showDone && <ul className="mt-2 grid sm:grid-cols-2 gap-2">{done.map(({ p }) => <li key={p.user_id} className="bg-white border border-slate-200 rounded-xl px-4 py-2 flex items-center gap-2"><Icon name="checkCircle" className="text-emerald-700" size={20} />{p.full_name}</li>)}</ul>}
        </div>
      )}

      <Card className="p-4 overflow-auto hidden md:block">
        <h2 className="text-lg font-bold mb-3">{t('Сотрудники и курсы')}</h2>
        <table className="min-w-full">
          <thead><tr><th className="text-left p-2">{t('Сотрудник')}</th>{courses.map(([id, title]) => (
            <th key={id} className="p-2 text-left align-bottom min-w-[150px]">
              <div className="line-clamp-2">{title}</div>
              <button className="text-brand-700 underline font-semibold min-h-[36px]" onClick={() => void download(`/api/protocols/attestation?course_id=${id}${dept ? `&department_id=${dept}` : ''}`, 'protocol.pdf')}>{t('Протокол PDF')}</button>
            </th>
          ))}</tr></thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.user_id} className="border-t border-slate-200">
                <td className="p-2 whitespace-nowrap"><div className="font-semibold">{p.full_name}</div><div className="text-slate-600 text-[0.9rem]">{p.position}</div></td>
                {courses.map(([cid]) => {
                  const r = cell(p.user_id, cid);
                  if (!r) return <td key={cid} className="p-1 text-slate-500">—</td>;
                  const k = CELL[r.status] || CELL.not_started;
                  return (
                    <td key={cid} className="p-1">
                      <div className={`rounded-lg px-2 py-1.5 font-semibold flex items-center gap-1.5 ${k.cls} ${r.overdue ? 'ring-2 ring-amber-700' : ''}`}>
                        <Icon name={r.overdue ? 'alert' : k.icon} size={16} />{t(r.status_ru)}{r.best_score != null ? ` · ${r.best_score}%` : ''}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap gap-2 mt-3">
          {(['passed', 'failed', 'pending_review', 'in_progress', 'not_started'] as const).map((k) => (
            <span key={k} className={`rounded-lg px-2 py-1 font-semibold flex items-center gap-1 ${CELL[k].cls}`}><Icon name={CELL[k].icon} size={16} />{t({ passed: 'сдал', failed: 'не сдал', pending_review: 'на проверке', in_progress: 'в процессе', not_started: 'не начат' }[k])}</span>
          ))}
          <span className="rounded-lg px-2 py-1 font-semibold ring-2 ring-amber-700 flex items-center gap-1"><Icon name="alert" size={16} />{t('просрочено')}</span>
        </div>
      </Card>
    </div>
  );
}

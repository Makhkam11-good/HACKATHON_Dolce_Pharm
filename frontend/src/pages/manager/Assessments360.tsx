import { type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, errorText } from '../../api/client';
import { RadarChart } from '../../components/Charts';
import { Icon } from '../../components/Icon';
import { Alert, Badge, Button, Card, Empty, Field, inputCls, Modal, PageTitle, Spinner, useToast } from '../../components/ui';
import type { User } from '../../types';

interface Item { id: string; title: string; period: string; status: string; subject_name: string; raters_total: number; raters_done: number; kind: string }
interface ProfileRow { competency_id: string; name: string; self: number | null; manager: number | null; peers: number | null; others: number | null; gap: number | null; gap_flag: boolean }
interface Profile {
  assessment: { id: string; title: string; period: string; status: string; subject_id: string; subject_name: string };
  kind: string; raters: { name: string; role: string; completed: boolean }[]; rows: ProfileRow[];
  recommendations: Rec[]; comments: { competency_id: string; rater_role: string; comment: string }[];
}
const ROLE: Record<string, string> = { self: 'самооценка', manager: 'руководитель', peer: 'коллега' };

interface AsgState { status: string; status_ru: string; due_date: string | null; overdue: boolean; attempts?: number; best_score?: number | null }
interface Rec { course_id: string; title: string; competencies: string[]; assignment: AsgState | null }
interface AssignResult extends AsgState { outcome: 'assigned' | 'already_assigned' | 'retrained'; full_name: string; already_assigned: boolean }
const STATUS_COLOR: Record<string, 'slate' | 'blue' | 'green' | 'amber' | 'red'> = {
  not_started: 'slate', in_progress: 'blue', passed: 'green', pending_review: 'amber', failed: 'red',
};
const fmtDue = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('ru-RU') : '');

/** Строка рекомендованного курса: статус сотрудника и кнопка с видимым результатом. */
function RecRow({ r, subjectId, onToast }: { r: Rec; subjectId: string; onToast: (kind: 'success' | 'error' | 'info', text: string) => void }) {
  const { t } = useTranslation();
  const [asg, setAsg] = useState<AsgState | null>(r.assignment);
  const [done, setDone] = useState<AssignResult['outcome'] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const assign = async (retrain: boolean) => {
    if (retrain && !window.confirm(t('Назначить курс повторно? Срок обновится, статус станет «не начат». История попыток сохранится.'))) return;
    setBusy(true);
    setErr('');
    try {
      // срок по умолчанию — 2 недели (как у повторного обучения на сервере)
      const due = new Date(Date.now() + 14 * 86400000);
      const dueIso = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`;
      const res = await api<AssignResult>('/api/assignments', { body: { course_id: r.course_id, user_ids: [subjectId], retrain, due_date: dueIso } });
      setAsg({ status: res.status, status_ru: res.status_ru, due_date: res.due_date, overdue: res.overdue });
      setDone(res.outcome);
      if (res.outcome === 'assigned') onToast('success', `${t('Курс назначен')}: ${res.full_name}`);
      else if (res.outcome === 'retrained') onToast('success', `${t('Назначено повторное обучение')}: ${res.full_name}`);
      else onToast('info', `${t('Уже назначен')}: ${res.full_name} — ${t(res.status_ru)}`);
    } catch (e) {
      const text = errorText(e);
      setErr(text);
      onToast('error', text);
    } finally {
      setBusy(false);
    }
  };

  let action: ReactNode;
  if (done === 'assigned' || done === 'retrained') {
    action = <Button icon="check" variant="success" disabled>{done === 'assigned' ? t('Назначено') : t('Назначено повторно')} ✓</Button>;
  } else if (!asg) {
    action = <Button icon="plus" disabled={busy} onClick={() => void assign(false)}>{busy ? t('Назначаем…') : t('Назначить')}</Button>;
  } else if (asg.status === 'passed') {
    action = <Button icon="refresh" variant="secondary" disabled={busy} onClick={() => void assign(true)}>{busy ? t('Назначаем…') : t('Назначить повторно')}</Button>;
  } else {
    action = <Button variant="secondary" disabled>{t('Уже назначен')}</Button>;
  }

  return (
    <li className="border rounded-xl p-3" data-course={r.course_id}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[12rem]">
          <div className="font-semibold">{r.title}</div>
          <div className="text-sm text-slate-500">{t('Развивает')}: {r.competencies.join(', ')}</div>
          <div className="flex flex-wrap gap-1.5 mt-1.5" data-testid="asg-status">
            {asg ? (
              <>
                <Badge color={STATUS_COLOR[asg.status] || 'slate'}>{t(asg.status_ru)}</Badge>
                {asg.due_date && <Badge color={asg.overdue ? 'red' : 'slate'}><Icon name="clock" size={14} />{t('до')} {fmtDue(asg.due_date)}{asg.overdue ? ` · ${t('просрочен')}` : ''}</Badge>}
              </>
            ) : <Badge color="slate">{t('не назначен')}</Badge>}
          </div>
        </div>
        {action}
      </div>
      {err && <div className="mt-2"><Alert kind="error">{err}</Alert></div>}
    </li>
  );
}

export default function Assessments360() {
  const { t } = useTranslation();
  const [list, setList] = useState<Item[] | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const showToast = useToast();

  const load = () => void api<Item[]>('/api/assessments').then(setList);
  useEffect(load, []);
  const open = (id: string) => void api<Profile>(`/api/assessments/${id}/profile`).then(setProfile);

  if (profile) {
    const p = profile;
    return (
      <div className="max-w-5xl">
        <button className="text-brand-700 font-medium min-h-tap flex items-center" onClick={() => { setProfile(null); setMsg(null); load(); }}><Icon name="left" />{t('Оценка 360')}</button>
        <PageTitle sub={`${p.assessment.period} · ${p.kind === '360' ? '360°' : '180°'}`} actions={p.assessment.status === 'open' && (
          <Button variant="secondary" onClick={() => void api<Profile>(`/api/assessments/${p.assessment.id}/close`, { method: 'POST' }).then(setProfile)}>{t('Закрыть оценку')}</Button>
        )}>{p.assessment.subject_name}</PageTitle>
        {msg && <div className="mb-3"><Alert kind={msg.kind}>{msg.text}</Alert></div>}
        <div className="flex flex-wrap gap-2 mb-4">
          <Badge color={p.assessment.status === 'open' ? 'blue' : 'slate'}>{p.assessment.status === 'open' ? t('открыта') : t('закрыта')}</Badge>
          {p.raters.map((r, i) => <Badge key={i} color={r.completed ? 'green' : 'amber'}>{r.name} · {t(ROLE[r.role])}{r.completed ? ' ✓' : ''}</Badge>)}
        </div>
        <div className="grid lg:grid-cols-2 gap-4">
          <Card className="p-4">
            <div className="font-bold mb-2">{t('Роза компетенций')}</div>
            <RadarChart labels={p.rows.map((r) => r.name)} series={[
              { label: t('Самооценка'), data: p.rows.map((r) => r.self), color: '#4F007D', point: 'circle' },
              { label: t('Руководитель'), data: p.rows.map((r) => r.manager), color: '#E56D6D', dash: [8, 5], point: 'rect' },
              ...(p.kind === '360' ? [{ label: t('Коллеги'), data: p.rows.map((r) => r.peers), color: '#6839CC', dash: [2, 4], point: 'triangle' as const }] : []),
            ]} />
          </Card>
          <Card className="p-4 overflow-auto">
            <div className="font-bold mb-2">{t('Разрывы: самооценка − оценка других')}</div>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-500"><th className="py-1">{t('Компетенция')}</th><th>{t('Сам')}</th><th>{t('Рук.')}</th><th>{t('Колл.')}</th><th>{t('Другие')}</th><th>{t('Разрыв')}</th></tr></thead>
              <tbody>{p.rows.map((r) => (
                <tr key={r.competency_id} className={`border-t ${r.gap_flag ? 'bg-amber-50' : ''}`}>
                  <td className="py-2 pr-2">{r.name}</td><td>{r.self ?? '—'}</td><td>{r.manager ?? '—'}</td><td>{r.peers ?? '—'}</td>
                  <td className={r.others != null && r.others < 3 ? 'text-red-700 font-bold' : ''}>{r.others ?? '—'}</td>
                  <td className={r.gap_flag ? 'font-bold text-amber-800' : ''}>{r.gap != null ? (r.gap > 0 ? `+${r.gap}` : r.gap) : '—'}{r.gap_flag && ' ⚠'}</td>
                </tr>
              ))}</tbody>
            </table>
            <div className="text-[0.85rem] text-slate-500 mt-2">{t('Подсвечены разрывы ≥ 1 балла; красным — средняя оценка других ниже 3.')}</div>
          </Card>
        </div>
        <Card className="p-4 mt-4">
          <div className="font-bold mb-2">{t('Рекомендованные курсы')}</div>
          {!p.recommendations.length ? <div className="text-slate-500">{t('Нет компетенций со средней оценкой ниже 3 — рекомендаций нет.')}</div> : (
            <ul className="space-y-2">{p.recommendations.map((r) => (
              <RecRow key={`${p.assessment.id}:${r.course_id}`} r={r} subjectId={p.assessment.subject_id} onToast={showToast} />
            ))}</ul>
          )}
        </Card>
        {p.comments.length > 0 && (
          <Card className="p-4 mt-4">
            <div className="font-bold mb-2">{t('Комментарии')}</div>
            <ul className="space-y-1 text-sm">{p.comments.map((c, i) => <li key={i}>«{c.comment}» <span className="text-slate-500">— {t(ROLE[c.rater_role])}, {p.rows.find((r) => r.competency_id === c.competency_id)?.name}</span></li>)}</ul>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <PageTitle actions={<Button icon="plus" onClick={() => setCreating(true)}>{t('Запустить оценку')}</Button>}>{t('Оценка 180/360')}</PageTitle>
      {msg && <div className="mb-3"><Alert kind={msg.kind}>{msg.text}</Alert></div>}
      {!list ? <Spinner /> : !list.length ? <Empty icon="star">{t('Оценок пока нет')}</Empty> : (
        <div className="space-y-2">{list.map((a) => (
          <Card key={a.id} className="p-4 flex items-center gap-3" onClick={() => open(a.id)}>
            <div className="flex-1"><div className="font-semibold">{a.subject_name}</div><div className="text-sm text-slate-500">{a.period} · {a.kind}° · {t('ответили')} {a.raters_done}/{a.raters_total}</div></div>
            <Badge color={a.status === 'open' ? 'blue' : 'slate'}>{a.status === 'open' ? t('открыта') : t('закрыта')}</Badge>
            <Icon name="right" className="text-slate-400" />
          </Card>
        ))}</div>
      )}
      {creating && <CreateModal onClose={() => setCreating(false)} onDone={(p) => { setCreating(false); setProfile(p); }} />}
    </div>
  );
}

function CreateModal({ onClose, onDone }: { onClose: () => void; onDone: (p: Profile) => void }) {
  const { t } = useTranslation();
  const [users, setUsers] = useState<User[]>([]);
  const [subject, setSubject] = useState('');
  const [peers, setPeers] = useState<string[]>([]);
  const [period, setPeriod] = useState(`IV квартал ${new Date().getFullYear()}`);
  const [err, setErr] = useState('');
  useEffect(() => void api<User[]>('/api/users?role=employee').then(setUsers), []);
  const subj = users.find((u) => u.id === subject);
  const candidates = users.filter((u) => u.id !== subject && (!subj || u.department_id === subj.department_id));
  const submit = async () => {
    setErr('');
    try {
      onDone(await api<Profile>('/api/assessments', { body: { subject_id: subject, peer_ids: peers, period } }));
    } catch (e) {
      setErr(errorText(e));
    }
  };
  return (
    <Modal open onClose={onClose} title={t('Запуск оценки')}>
      <Field label={t('Оцениваемый сотрудник')}>
        <select className={inputCls} value={subject} onChange={(e) => { setSubject(e.target.value); setPeers([]); }}>
          <option value="">—</option>{users.map((u) => <option key={u.id} value={u.id}>{u.full_name} · {u.department_name}</option>)}
        </select>
      </Field>
      <Field label={t('Период')}><input className={inputCls} value={period} onChange={(e) => setPeriod(e.target.value)} /></Field>
      <div className="text-sm font-semibold mb-1">{t('Коллеги (2–5) — для 360°. Без коллег — оценка 180° (сам + руководитель).')}</div>
      <div className="max-h-56 overflow-auto border rounded-xl divide-y mb-3">
        {candidates.map((u) => (
          <label key={u.id} className="flex items-center gap-2 p-2 min-h-tap">
            <input type="checkbox" className="w-5 h-5" checked={peers.includes(u.id)} disabled={!peers.includes(u.id) && peers.length >= 5}
              onChange={(e) => setPeers(e.target.checked ? [...peers, u.id] : peers.filter((x) => x !== u.id))} />
            {u.full_name}<span className="text-[0.85rem] text-slate-500">{u.position}</span>
          </label>
        ))}
      </div>
      {peers.length === 1 && <div className="mb-2"><Alert kind="warn">{t('Для 360° выберите минимум двух коллег')}</Alert></div>}
      {err && <div className="mb-3"><Alert kind="error">{err}</Alert></div>}
      <Button big disabled={!subject || peers.length === 1} onClick={() => void submit()}>{peers.length ? t('Запустить 360°') : t('Запустить 180°')}</Button>
    </Modal>
  );
}

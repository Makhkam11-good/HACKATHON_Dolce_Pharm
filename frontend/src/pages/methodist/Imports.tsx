import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, download, errorText } from '../../api/client';
import { Alert, Badge, Button, Card, Field, inputCls, Modal, PageTitle, Spinner } from '../../components/ui';
import { authToken } from '../../offline/session';
import type { Department, User } from '../../types';

interface ImportResult { created: number; updated: number; errors: { row: number; message: string }[]; preview: { row: number; action: string; full_name: string; login: string; role: string; position: string; department: string }[]; dry_run: boolean }
const ROLE_RU: Record<string, string> = { admin: 'администратор', methodist: 'методист', manager: 'руководитель', employee: 'сотрудник' };

async function postImport(file: File, dry: boolean): Promise<ImportResult> {
  const fd = new FormData();
  fd.append('file', file);
  const r = await fetch(`/api/imports/users?dry_run=${dry}`, { method: 'POST', body: fd, headers: { Authorization: `Bearer ${authToken()}` } });
  const j = await r.json();
  if (!r.ok) throw new Error(j.detail?.message || `Ошибка ${r.status}`);
  return j;
}

export default function Users() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<User[] | null>(null);
  const [depts, setDepts] = useState<Department[]>([]);
  const [q, setQ] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [res, setRes] = useState<ImportResult | null>(null);
  const [err, setErr] = useState('');
  const [edit, setEdit] = useState<Partial<User> & { password?: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const load = () => void api<User[]>('/api/users').then(setUsers);
  useEffect(() => {
    load();
    void api<Department[]>('/api/departments').then(setDepts);
  }, []);

  const run = async (dry: boolean) => {
    if (!file) return;
    setErr('');
    try {
      setRes(await postImport(file, dry));
      if (!dry) load();
    } catch (e) {
      setErr(errorText(e));
    }
  };

  const saveUser = async () => {
    if (!edit) return;
    setErr('');
    try {
      const body = { full_name: edit.full_name, login: edit.login, role: edit.role, position: edit.position, department_id: edit.department_id || null, ...(edit.password ? { password: edit.password } : {}) };
      if (edit.id) await api(`/api/users/${edit.id}`, { method: 'PATCH', body });
      else await api('/api/users', { body });
      setEdit(null);
      load();
    } catch (e) {
      setErr(errorText(e));
    }
  };

  const shown = (users || []).filter((u) => !q || `${u.full_name} ${u.login}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <PageTitle actions={<>
        <Button variant="secondary" icon="download" onClick={() => void download('/api/exports/users?format=xlsx', 'users.xlsx')}>XLSX</Button>
        <Button variant="secondary" icon="download" onClick={() => void download('/api/exports/users?format=csv', 'users.csv')}>CSV</Button>
        <Button icon="plus" onClick={() => setEdit({ role: 'employee' })}>{t('Пользователь')}</Button>
      </>}>{t('Пользователи')}</PageTitle>

      <Card className="p-4 mb-4">
        <div className="font-semibold mb-1">{t('Импорт из CSV / XLSX')}</div>
        <div className="text-sm text-slate-500 mb-3">{t('Колонки')}: <code>full_name, login, password, role, position, department</code>. {t('Роль: employee / manager / methodist / admin (или по-русски). Существующие логины обновляются.')}</div>
        <input ref={input} type="file" accept=".csv,.xlsx" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] || null); setRes(null); }} />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon="upload" onClick={() => input.current?.click()}>{file ? file.name : t('Выбрать файл')}</Button>
          <Button disabled={!file} onClick={() => void run(true)}>{t('Предпросмотр')}</Button>
          <Button variant="success" disabled={!file || !res?.dry_run} onClick={() => void run(false)}>{t('Импортировать')}</Button>
        </div>
        {err && <div className="mt-3"><Alert kind="error">{err}</Alert></div>}
        {res && (
          <div className="mt-3 space-y-2">
            <Alert kind={res.errors.length ? 'warn' : 'success'}>
              {res.dry_run ? t('Предпросмотр') : t('Готово')}: {t('создать')} {res.created}, {t('обновить')} {res.updated}, {t('ошибок')} {res.errors.length}
            </Alert>
            {res.errors.length > 0 && <ul className="text-sm text-red-700 list-disc pl-5">{res.errors.map((e) => <li key={e.row}>{t('Строка')} {e.row}: {e.message}</li>)}</ul>}
            {res.dry_run && res.preview.length > 0 && (
              <div className="overflow-auto max-h-72 border rounded-xl">
                <table className="w-full text-sm"><tbody>{res.preview.map((p) => (
                  <tr key={p.row} className="border-b"><td className="p-2">{p.row}</td><td className="p-2"><Badge color={p.action === 'create' ? 'green' : 'blue'}>{p.action === 'create' ? t('новый') : t('обновление')}</Badge></td><td className="p-2">{p.full_name}</td><td className="p-2 font-mono">{p.login}</td><td className="p-2">{t(ROLE_RU[p.role])}</td><td className="p-2">{p.department}</td></tr>
                ))}</tbody></table>
              </div>
            )}
          </div>
        )}
      </Card>

      <input className={`${inputCls} mb-3 max-w-sm`} placeholder={t('Поиск')} value={q} onChange={(e) => setQ(e.target.value)} />
      {!users ? <Spinner /> : (
        <div className="overflow-auto bg-white border rounded-2xl">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left"><tr><th className="p-3">{t('ФИО')}</th><th className="p-3">{t('Логин')}</th><th className="p-3">{t('Роль')}</th><th className="p-3">{t('Должность')}</th><th className="p-3">{t('Подразделение')}</th></tr></thead>
            <tbody>
              {shown.map((u) => (
                <tr key={u.id} className={`border-t hover:bg-brand-50 cursor-pointer ${u.is_active ? '' : 'opacity-50'}`} onClick={() => setEdit(u)}>
                  <td className="p-3 font-medium">{u.full_name}</td><td className="p-3 font-mono">{u.login}</td><td className="p-3">{t(ROLE_RU[u.role])}</td><td className="p-3">{u.position}</td><td className="p-3">{u.department_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? t('Пользователь') : t('Новый пользователь')}>
        {edit && <>
          <Field label={t('ФИО')}><input className={inputCls} value={edit.full_name || ''} onChange={(e) => setEdit({ ...edit, full_name: e.target.value })} /></Field>
          <Field label={t('Логин')}><input className={inputCls} disabled={!!edit.id} value={edit.login || ''} onChange={(e) => setEdit({ ...edit, login: e.target.value })} /></Field>
          <Field label={edit.id ? t('Новый пароль (пусто — не менять)') : t('Пароль')}><input className={inputCls} type="password" value={edit.password || ''} onChange={(e) => setEdit({ ...edit, password: e.target.value })} /></Field>
          <Field label={t('Роль')}><select className={inputCls} value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value as User['role'] })}>{Object.keys(ROLE_RU).map((r) => <option key={r} value={r}>{t(ROLE_RU[r])}</option>)}</select></Field>
          <Field label={t('Должность')}><input className={inputCls} value={edit.position || ''} onChange={(e) => setEdit({ ...edit, position: e.target.value })} /></Field>
          <Field label={t('Подразделение')}><select className={inputCls} value={edit.department_id || ''} onChange={(e) => setEdit({ ...edit, department_id: e.target.value || null })}><option value="">—</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
          {err && <div className="mb-3"><Alert kind="error">{err}</Alert></div>}
          <div className="flex gap-2">
            <Button big onClick={() => void saveUser()}>{t('Сохранить')}</Button>
            {edit.id && edit.is_active && <Button variant="danger" onClick={() => void api(`/api/users/${edit.id}`, { method: 'DELETE' }).then(() => { setEdit(null); load(); })}>{t('Отключить')}</Button>}
          </div>
        </>}
      </Modal>
    </div>
  );
}

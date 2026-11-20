import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router-dom';
import { errorText } from '../../api/client';
import { useAuth } from '../../auth';
import { DEMO_NOTE } from '../../components/Layout';
import { Alert, Button, Field, inputCls, useOnline } from '../../components/ui';
import { setLang } from '../../i18n';

const DEMO = [
  ['op01', 'Оператор (сотрудник)'],
  ['methodist', 'Методист'],
  ['manager1', 'Начальник цеха'],
  ['admin', 'Администратор'],
];

export default function Login() {
  const { t, i18n } = useTranslation();
  const { user, ready, login } = useAuth();
  const nav = useNavigate();
  const online = useOnline();
  const [form, setForm] = useState({ login: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (ready && user) return <Navigate to="/" replace />;

  const submit = async (e?: FormEvent, l = form.login, p = form.password) => {
    e?.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await login(l.trim(), p);
      nav('/');
    } catch (ex) {
      setErr(errorText(ex));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-brand-50 to-white">
      <div className="flex justify-end p-3">
        <button className="min-h-tap px-3 rounded-xl font-bold text-slate-600 hover:bg-white" onClick={() => setLang(i18n.language === 'kk' ? 'ru' : 'kk')}>
          {i18n.language === 'kk' ? 'Русский' : 'Қазақша'}
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <img src="/icons/favicon.svg" className="w-20 h-20 mx-auto mb-3" alt="" />
            <h1 className="text-2xl font-bold text-brand-800">Dolce Pharm</h1>
            <p className="text-slate-600">{t('Обучение и аттестация персонала')}</p>
          </div>
          <form onSubmit={submit} className="bg-white rounded-2xl shadow-sm border p-5">
            {!online && <div className="mb-3"><Alert kind="warn">{t('Нет сети. Для первого входа нужно подключение к серверу.')}</Alert></div>}
            <Field label={t('Логин')}>
              <input className={inputCls} autoComplete="username" autoCapitalize="none" value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} />
            </Field>
            <Field label={t('Пароль')}>
              <input className={inputCls} type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>
            {err && <div className="mb-3"><Alert kind="error">{err}</Alert></div>}
            <Button big type="submit" disabled={busy || !form.login}>{busy ? t('Вход…') : t('Войти')}</Button>
          </form>
          <div className="mt-5 bg-white/70 rounded-2xl border p-4">
            <div className="text-sm font-semibold text-slate-700 mb-2">{t('Демо-доступ (пароль у всех: demo123)')}</div>
            <div className="grid grid-cols-2 gap-2">
              {DEMO.map(([l, label]) => (
                <button key={l} disabled={busy || !online} className="text-left rounded-xl border px-3 py-2 min-h-tap hover:bg-brand-50 disabled:opacity-50"
                  onClick={() => { setForm({ login: l, password: 'demo123' }); void submit(undefined, l, 'demo123'); }}>
                  <div className="font-mono font-bold text-brand-700">{l}</div>
                  <div className="text-xs text-slate-500">{t(label)}</div>
                </button>
              ))}
            </div>
            <div className="text-xs text-slate-500 mt-2">{t('Сотрудники: op01…op20')}</div>
          </div>
        </div>
      </div>
      <p className="text-center text-xs text-red-700 px-4 py-4 font-medium">{t(DEMO_NOTE)}</p>
    </div>
  );
}

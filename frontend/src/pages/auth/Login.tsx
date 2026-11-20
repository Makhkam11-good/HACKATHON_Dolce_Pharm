import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router-dom';
import { ApiError, errorText } from '../../api/client';
import { useAuth } from '../../auth';
import { Icon } from '../../components/Icon';
import { DEMO_NOTE, LangSwitch } from '../../components/Layout';
import { Banner, Button, Field, inputCls, useOnline } from '../../components/ui';

const DEMO = [
  ['op01', 'Оператор (сотрудник)'],
  ['manager1', 'Начальник цеха'],
  ['methodist', 'Методист'],
  ['admin', 'Администратор'],
];

export default function Login() {
  const { t } = useTranslation();
  const { user, ready, login } = useAuth();
  const nav = useNavigate();
  const online = useOnline();
  const [form, setForm] = useState({ login: '', password: '' });
  const [show, setShow] = useState(false);
  const [demo, setDemo] = useState(false);
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
      setErr(ex instanceof ApiError && ex.status === 401 ? t('Неверный логин или пароль. Проверьте и попробуйте ещё раз.') : errorText(ex));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-slate-50">
      <div className="bg-brand-600 pt-[env(safe-area-inset-top)]">
        <div className="max-w-md mx-auto px-4 pt-6 pb-16 text-center">
          <img src="/brand/logo-on-dark.png" alt="Dolce Pharm" className="h-20 w-auto mx-auto" />
          <p className="text-white text-lg font-semibold mt-4">{t('Обучение сотрудников')}</p>
          <p className="text-white/85">{t('С заботой о здоровье!')}</p>
        </div>
      </div>
      <div className="flex-1 px-4 -mt-10">
        <div className="w-full max-w-md mx-auto">
          <form onSubmit={submit} className="bg-white rounded-[20px] shadow-lift border border-slate-200 p-5">
            <h1 className="text-2xl font-bold mb-4">{t('Вход')}</h1>
            {!online && <div className="mb-4"><Banner kind="offline">{t('Нет интернета. Для первого входа нужно подключение к интернету.')}</Banner></div>}
            <Field label={t('Логин')}>
              <input className={inputCls} autoComplete="username" autoCapitalize="none" value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} />
            </Field>
            <Field label={t('Пароль')}>
              <div className="relative">
                <input className={`${inputCls} pr-36`} type={show ? 'text' : 'password'} autoComplete="current-password" value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })} />
                <button type="button" onClick={() => setShow((v) => !v)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 min-h-tap px-3 rounded-xl flex items-center gap-1.5 text-brand-700 font-semibold hover:bg-brand-50">
                  <Icon name={show ? 'eyeOff' : 'eye'} size={20} />{show ? t('Скрыть') : t('Показать')}
                </button>
              </div>
            </Field>
            {err && <div className="mb-4"><Banner kind="error">{err}</Banner></div>}
            <Button big type="submit" disabled={busy || !form.login}>{busy ? t('Входим…') : t('Войти')}</Button>
          </form>

          <div className="mt-5">
            <div className="font-semibold text-slate-800 mb-2 text-center">{t('Язык')} / Тіл</div>
            <LangSwitch big />
          </div>

          <div className="mt-5 mb-4">
            <button type="button" onClick={() => setDemo((v) => !v)} aria-expanded={demo}
              className="w-full min-h-tap rounded-btn border-2 border-dashed border-slate-300 text-slate-700 font-semibold flex items-center justify-center gap-2">
              <Icon name={demo ? 'up' : 'down'} size={20} />{t('Демо-входы для проверки')}
            </button>
            {demo && (
              <div className="mt-3 bg-white rounded-2xl border border-slate-200 p-4">
                <div className="text-slate-700 mb-3">{t('Пароль у всех: demo123. Сотрудники: op01…op20.')}</div>
                <div className="grid grid-cols-2 gap-3">
                  {DEMO.map(([l, label]) => (
                    <button key={l} disabled={busy || !online}
                      className="text-left rounded-xl border-2 border-slate-200 px-3 py-2 min-h-[3.5rem] hover:border-brand-600 disabled:opacity-60"
                      onClick={() => { setForm({ login: l, password: 'demo123' }); void submit(undefined, l, 'demo123'); }}>
                      <div className="font-bold text-brand-700">{l}</div>
                      <div className="text-[0.85rem] text-slate-600 leading-tight">{t(label)}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <p className="text-center text-[0.8rem] text-slate-500 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">{t(DEMO_NOTE)}</p>
    </div>
  );
}

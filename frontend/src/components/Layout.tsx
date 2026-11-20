import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { setLang } from '../i18n';
import type { Role } from '../types';
import { Icon, type IconName } from './Icon';
import { OfflineBanner, SyncBadge, useUnsent } from './SyncBadge';
import { Button, Modal } from './ui';

interface NavItem { to: string; label: string; icon: IconName; roles: Role[] }

export const NAV: NavItem[] = [
  { to: '/dash', label: 'Дашборд', icon: 'home', roles: ['manager'] },
  { to: '/m/courses', label: 'Курсы', icon: 'book', roles: ['admin', 'methodist'] },
  { to: '/my', label: 'Мои курсы', icon: 'book', roles: ['employee', 'manager', 'admin', 'methodist'] },
  { to: '/results', label: 'Результаты', icon: 'award', roles: ['employee', 'manager', 'admin', 'methodist'] },
  { to: '/library', label: 'Библиотека', icon: 'library', roles: ['employee', 'manager'] },
  { to: '/m/library', label: 'Библиотека', icon: 'library', roles: ['admin', 'methodist'] },
  { to: '/assess', label: 'Оценка 360', icon: 'star', roles: ['employee'] },
  { to: '/trainer', label: 'Тренажёр', icon: 'chat', roles: ['employee', 'manager'] },
  { to: '/qr-transfer', label: 'Передать без сети', icon: 'qr', roles: ['employee'] },
  { to: '/m/assignments', label: 'Назначения', icon: 'tasks', roles: ['admin', 'methodist', 'manager'] },
  { to: '/m/reviews', label: 'Проверка ответов', icon: 'check', roles: ['admin', 'methodist'] },
  { to: '/m/scenarios', label: 'Тренажёры', icon: 'chat', roles: ['admin', 'methodist'] },
  { to: '/m/users', label: 'Пользователи', icon: 'users', roles: ['admin', 'methodist'] },
  { to: '/reports', label: 'Отчёты', icon: 'chart', roles: ['admin', 'methodist', 'manager'] },
  { to: '/a360', label: 'Оценка 360', icon: 'star', roles: ['admin', 'methodist', 'manager'] },
  { to: '/assess', label: 'Мои оценки 360', icon: 'star', roles: ['admin', 'methodist', 'manager'] },
  { to: '/qr-receive', label: 'Принять по QR', icon: 'camera', roles: ['admin', 'methodist', 'manager'] },
];

export const DEMO_NOTE = 'Демо-версия. Все данные синтетические и не содержат реальных персональных данных';

export function Footer() {
  const { t } = useTranslation();
  return <footer className="text-center text-xs text-slate-500 px-4 py-4 pb-24 md:pb-4">{t(DEMO_NOTE)}</footer>;
}

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const [more, setMore] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const { pending } = useUnsent(user?.id);
  if (!user) return <>{children}</>;
  const items = NAV.filter((n) => n.roles.includes(user.role));
  const bottom = items.slice(0, 4);

  const doLogout = async () => {
    setConfirmOut(false);
    await logout();
    nav('/login');
  };

  const link = (n: NavItem, compact = false) => (
    <NavLink
      key={n.to + n.label}
      to={n.to}
      onClick={() => setMore(false)}
      className={({ isActive }) =>
        compact
          ? `flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[60px] text-xs font-medium ${isActive ? 'text-brand-700' : 'text-slate-500'}`
          : `flex items-center gap-3 rounded-xl px-3 min-h-tap font-medium ${isActive ? 'bg-brand-600 text-white' : 'text-slate-700 hover:bg-brand-50'}`
      }
    >
      <Icon name={n.icon} size={compact ? 24 : 20} />
      <span className={compact ? 'leading-tight text-center' : ''}>{t(n.label)}</span>
    </NavLink>
  );

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
        <OfflineBanner />
        <div className="flex items-center gap-2 px-3 sm:px-5 h-16">
          <NavLink to="/" className="flex items-center gap-2 font-bold text-brand-700 shrink-0">
            <img src="/icons/favicon.svg" alt="" className="w-9 h-9" />
            <span className="hidden sm:block leading-tight">Dolce Pharm<br /><span className="text-xs font-medium text-slate-500">{t('Обучение')}</span></span>
          </NavLink>
          <div className="flex-1" />
          <SyncBadge userId={user.id} />
          <button
            className="min-h-tap min-w-tap rounded-xl hover:bg-slate-100 text-sm font-bold text-slate-600"
            onClick={() => setLang(i18n.language === 'kk' ? 'ru' : 'kk')}
            title={t('Язык')}
          >
            {i18n.language === 'kk' ? 'ҚАЗ' : 'РУС'}
          </button>
          <button className="min-h-tap min-w-tap rounded-xl hover:bg-slate-100 flex items-center justify-center" onClick={() => (pending ? setConfirmOut(true) : void doLogout())} title={t('Выйти')}>
            <Icon name="logout" />
          </button>
        </div>
      </header>
      <div className="flex flex-1">
        <aside className="hidden md:block w-60 shrink-0 border-r border-slate-200 bg-white p-3 space-y-1">
          <div className="px-3 py-2 mb-2">
            <div className="font-semibold text-slate-900 leading-tight">{user.full_name}</div>
            <div className="text-xs text-slate-500">{user.position || t(user.role)}</div>
          </div>
          {items.map((n) => link(n))}
        </aside>
        <main className="flex-1 min-w-0 flex flex-col">
          <div className="flex-1 w-full max-w-6xl mx-auto px-3 sm:px-6 py-5">{children}</div>
          <Footer />
        </main>
      </div>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 flex pb-[env(safe-area-inset-bottom)]">
        {bottom.map((n) => link(n, true))}
        <button className="flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[60px] text-xs font-medium text-slate-500" onClick={() => setMore(true)}>
          <Icon name="menu" size={24} />
          {t('Ещё')}
        </button>
      </nav>
      <Modal open={more} onClose={() => setMore(false)} title={user.full_name}>
        <div className="space-y-1">{items.map((n) => link(n))}</div>
      </Modal>
      <Modal open={confirmOut} onClose={() => setConfirmOut(false)} title={t('Есть неотправленные данные')}>
        <p className="mb-4">
          {t('На телефоне {{n}} записей ещё не дошли до сервера. Они сохранятся на устройстве и отправятся при следующем входе. Если сети нет — передайте их мастеру через QR.', { n: pending })}
        </p>
        <div className="flex flex-col gap-2">
          {user.role === 'employee' && (
            <Button icon="qr" big onClick={() => { setConfirmOut(false); nav('/qr-transfer'); }}>{t('Передать мастеру через QR')}</Button>
          )}
          <Button variant="secondary" big onClick={() => void doLogout()}>{t('Всё равно выйти')}</Button>
        </div>
      </Modal>
    </div>
  );
}

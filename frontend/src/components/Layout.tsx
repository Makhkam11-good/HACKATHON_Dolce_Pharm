import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useMatch, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { setLang } from '../i18n';
import type { Role } from '../types';
import { Icon, type IconName } from './Icon';
import { QrTransferButton } from './QrTransferButton';
import { OfflineBanner, SyncBadge, useUnsent } from './SyncBadge';
import { Button, ConfirmModal, Modal } from './ui';

interface NavItem { to: string; label: string; icon: IconName; roles: Role[]; labels?: Partial<Record<Role, string>> }

/** Пункты меню. Подписи — простыми словами; у некоторых пунктов подпись зависит от роли. */
export const NAV: NavItem[] = [
  { to: '/dash', label: 'Кто не прошёл обучение', icon: 'users', roles: ['manager'] },
  { to: '/m/courses', label: 'Курсы', icon: 'book', roles: ['admin', 'methodist'] },
  { to: '/qr-receive', label: 'Принять результаты сотрудников', icon: 'camera', roles: ['admin', 'methodist', 'manager'] },
  { to: '/my', label: 'Обучение', icon: 'bookOpen', roles: ['employee', 'manager', 'admin', 'methodist'], labels: { manager: 'Моё обучение', admin: 'Моё обучение', methodist: 'Моё обучение' } },
  { to: '/results', label: 'Результаты', icon: 'award', roles: ['employee', 'manager', 'admin', 'methodist'], labels: { manager: 'Мои результаты', admin: 'Мои результаты', methodist: 'Мои результаты' } },
  { to: '/library', label: 'Документы', icon: 'docs', roles: ['employee', 'manager'] },
  { to: '/m/library', label: 'Документы', icon: 'docs', roles: ['admin', 'methodist'] },
  { to: '/assess', label: 'Анкеты оценки', icon: 'star', roles: ['employee', 'admin', 'methodist', 'manager'] },
  { to: '/trainer', label: 'Тренажёр', icon: 'chat', roles: ['employee', 'manager'] },
  { to: '/qr-transfer', label: 'Передать результаты мастеру', icon: 'send', roles: ['employee'] },
  { to: '/m/assignments', label: 'Назначения', icon: 'tasks', roles: ['admin', 'methodist', 'manager'] },
  { to: '/m/reviews', label: 'Проверка ответов', icon: 'check', roles: ['admin', 'methodist'] },
  { to: '/m/scenarios', label: 'Тренажёры', icon: 'chat', roles: ['admin', 'methodist'] },
  { to: '/m/users', label: 'Пользователи', icon: 'user', roles: ['admin', 'methodist'] },
  { to: '/reports', label: 'Отчёты', icon: 'chart', roles: ['admin', 'methodist', 'manager'] },
  { to: '/a360', label: 'Оценка 180/360', icon: 'star', roles: ['admin', 'methodist', 'manager'] },
];

/** Нижнее меню на телефоне: максимум 4 пункта (+ «Ещё»), короткие подписи. */
const BOTTOM: Record<Role, { to: string; label: string }[]> = {
  employee: [{ to: '/my', label: 'Обучение' }, { to: '/results', label: 'Результаты' }, { to: '/library', label: 'Документы' }],
  manager: [{ to: '/dash', label: 'Сотрудники' }, { to: '/qr-receive', label: 'Приём' }, { to: '/reports', label: 'Отчёты' }],
  methodist: [{ to: '/m/courses', label: 'Курсы' }, { to: '/qr-receive', label: 'Приём' }, { to: '/reports', label: 'Отчёты' }],
  admin: [{ to: '/m/courses', label: 'Курсы' }, { to: '/qr-receive', label: 'Приём' }, { to: '/reports', label: 'Отчёты' }],
};

export const DEMO_NOTE = 'Демо-версия. Данные синтетические';

export function Footer() {
  const { t } = useTranslation();
  return <footer className="text-center text-[0.8rem] text-slate-500 px-4 pt-6 pb-bottom-nav">{t(DEMO_NOTE)}</footer>;
}

function LangSwitch({ big }: { big?: boolean }) {
  const { i18n } = useTranslation();
  const cur = i18n.language === 'kk' ? 'kk' : 'ru';
  return (
    <div className={`grid grid-cols-2 gap-3 ${big ? '' : 'max-w-[13rem]'}`} role="group" aria-label="Язык / Тіл">
      {(['ru', 'kk'] as const).map((l) => (
        <button key={l} onClick={() => setLang(l)} aria-pressed={cur === l}
          className={`min-h-tap rounded-btn font-bold border-2 ${cur === l ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-slate-300 text-slate-800 hover:border-brand-600'}`}>
          {l === 'ru' ? 'Русский' : 'Қазақша'}
        </button>
      ))}
    </div>
  );
}
export { LangSwitch };

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const nav = useNavigate();
  const [more, setMore] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const { pending } = useUnsent(user?.id);
  // На просмотре материала и в тесте нижнее меню не нужно: снизу своя панель «Назад / Далее»
  const onMaterial = useMatch('/course/:courseId/m/:materialId');
  const onTest = useMatch('/course/:courseId/test');
  const hideNav = !!(onMaterial || onTest);
  if (!user) return <>{children}</>;
  const label = (n: NavItem) => t(n.labels?.[user.role] ?? n.label);
  const items = NAV.filter((n) => n.roles.includes(user.role));
  const bottom = BOTTOM[user.role];
  const moreItems = items.filter((n) => !bottom.some((b) => b.to === n.to) && n.to !== '/qr-transfer');

  const doLogout = async () => {
    setConfirmOut(false);
    setMore(false);
    await logout();
    nav('/login');
  };
  const askLogout = () => (pending ? setConfirmOut(true) : void doLogout());

  const sideLink = (n: NavItem) => (
    <NavLink key={n.to + n.label} to={n.to}
      className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 min-h-tap font-semibold ${isActive ? 'bg-brand-600 text-white' : 'text-slate-700 hover:bg-brand-50'}`}>
      <Icon name={n.icon} size={20} />
      <span className="leading-tight py-1.5">{label(n)}</span>
    </NavLink>
  );

  return (
    <div className={`app-shell min-h-[100dvh] flex flex-col bg-slate-50 ${hideNav ? 'nav-hidden' : ''}`}>
      <header className="sticky top-0 z-30 bg-brand-600 text-white">
        <div className="flex items-center gap-3 px-3 sm:px-5 h-16 pt-[env(safe-area-inset-top)] box-content">
          <NavLink to="/" className="shrink-0 rounded-xl" aria-label="Dolce Pharm — на главную">
            <img src="/brand/logo-on-dark.png" alt="Dolce Pharm" className="h-11 w-auto" />
          </NavLink>
          <span className="hidden lg:block text-white/90 font-semibold ml-1">{t('Обучение сотрудников')}</span>
          <div className="flex-1" />
          <SyncBadge userId={user.id} onDark />
          <div className="hidden md:flex items-center gap-2 ml-2">
            <span className="text-right leading-tight mr-1">
              <span className="block font-semibold">{user.full_name.split(' ').slice(0, 2).join(' ')}</span>
              <span className="block text-[0.8rem] text-white/80">{user.position || t(user.role)}</span>
            </span>
          </div>
        </div>
        <OfflineBanner />
      </header>
      <div className="flex flex-1">
        <aside className="hidden md:flex flex-col w-60 shrink-0 border-r border-slate-200 bg-white p-3 gap-1 sticky top-16 self-start h-[calc(100dvh-4rem)] overflow-y-auto">
          {items.map(sideLink)}
          <div className="mt-auto pt-4 space-y-3 border-t border-slate-200">
            <LangSwitch />
            <button onClick={askLogout} className="flex items-center gap-3 rounded-xl px-3 min-h-tap font-semibold text-slate-700 hover:bg-slate-100 w-full">
              <Icon name="logout" size={20} />{t('Выйти')}
            </button>
          </div>
        </aside>
        <main className="flex-1 min-w-0 flex flex-col">
          <div className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-5">{children}</div>
          <Footer />
        </main>
      </div>
      {!hideNav && (
        <nav className="bottom-nav md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 grid grid-cols-4 px-1" aria-label={t('Меню')}>
          {bottom.map((b) => {
            const n = items.find((x) => x.to === b.to)!;
            return (
              <NavLink key={b.to} to={b.to}
                className={({ isActive }) => `m-1 flex flex-col items-center justify-center gap-0.5 rounded-2xl text-[0.8rem] font-semibold ${isActive ? 'bg-brand-50 text-brand-700' : 'text-[#555555]'}`}>
                <Icon name={n.icon} size={26} />
                <span className="leading-tight">{t(b.label)}</span>
              </NavLink>
            );
          })}
          <button className={`m-1 flex flex-col items-center justify-center gap-0.5 rounded-2xl text-[0.8rem] font-semibold ${more ? 'bg-brand-50 text-brand-700' : 'text-[#555555]'}`} onClick={() => setMore(true)}>
            <Icon name="menu" size={26} />
            <span className="leading-tight">{t('Ещё')}</span>
          </button>
        </nav>
      )}
      <Modal open={more} onClose={() => setMore(false)} title={t('Ещё')}>
        <div className="flex items-center gap-3 mb-4">
          <span className="w-12 h-12 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center shrink-0"><Icon name="user" size={24} /></span>
          <span className="leading-tight"><span className="block font-bold text-slate-900">{user.full_name}</span><span className="text-slate-600">{user.position || t(user.role)}</span></span>
        </div>
        <QrTransferButton className="mb-5" onNavigate={() => setMore(false)} />
        <div className="space-y-2 mb-5">
          {moreItems.map((n) => (
            <NavLink key={n.to + n.label} to={n.to} onClick={() => setMore(false)}
              className={({ isActive }) => `flex items-center gap-3 rounded-2xl border px-4 min-h-[60px] font-semibold ${isActive ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-800'}`}>
              <Icon name={n.icon} size={24} />
              <span className="flex-1">{label(n)}</span>
              <Icon name="right" className="text-slate-500" />
            </NavLink>
          ))}
        </div>
        <div className="font-bold text-slate-900 mb-2">{t('Язык')} / Тіл</div>
        <div className="mb-5"><LangSwitch big /></div>
        <Button big variant="secondary" icon="logout" onClick={askLogout}>{t('Выйти из приложения')}</Button>
      </Modal>
      <ConfirmModal
        open={confirmOut}
        title={t('Не все результаты отправлены')}
        confirmText={user.role === 'employee' ? t('Передать результаты мастеру') : t('Всё равно выйти')}
        cancelText={user.role === 'employee' ? t('Всё равно выйти') : t('Отмена')}
        onConfirm={() => {
          setConfirmOut(false);
          if (user.role === 'employee') { setMore(false); nav('/qr-transfer'); } else void doLogout();
        }}
        onCancel={() => (user.role === 'employee' ? void doLogout() : setConfirmOut(false))}
        onClose={() => setConfirmOut(false)}
      >
        {t('Ждут отправки: {{n}}. Они останутся на телефоне и отправятся при следующем входе. Если интернета нет — передайте их мастеру.', { n: pending })}
      </ConfirmModal>
    </div>
  );
}

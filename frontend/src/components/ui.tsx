/**
 * Дизайн-система Dolce Pharm: базовые компоненты.
 * Правила для оператора: иконка всегда с подписью, зоны нажатия ≥ 48px, главная кнопка ≥ 56px на всю ширину,
 * статус = цвет + иконка + текст, простые слова вместо технических.
 */
import { type ButtonHTMLAttributes, type ReactNode, createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isOnline, subscribeNetwork } from '../offline/network';
import { Icon, type IconName } from './Icon';

// ---------------------------------------------------------------- Button
type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
const VARIANT: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 disabled:bg-slate-300 disabled:text-slate-600',
  secondary: 'bg-white text-brand-700 border-2 border-brand-600 hover:bg-brand-50 active:bg-brand-100 disabled:border-slate-300 disabled:text-slate-500',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-slate-300 disabled:text-slate-600',
  ghost: 'text-brand-700 hover:bg-brand-50 active:bg-brand-100 disabled:text-slate-500',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-600',
};

export function Button({ variant = 'primary', icon, children, className = '', big, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; icon?: IconName; big?: boolean }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-btn font-semibold min-h-tap px-5 transition-colors select-none text-center leading-tight ${big ? 'text-lg min-h-big py-3 w-full font-bold' : 'text-base py-2'} ${VARIANT[variant]} ${className}`}
      {...rest}
    >
      {icon && <Icon name={icon} size={big ? 24 : 20} />}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- Card / BigActionCard / ListItem
export function Card({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={`bg-white rounded-2xl border border-slate-200 shadow-card ${onClick ? 'cursor-pointer hover:border-brand-300 active:bg-brand-50' : ''} ${className}`}>
      {children}
    </div>
  );
}

/** Большая карточка с одним главным действием (главная оператора). */
export function BigActionCard({ eyebrow, eyebrowIcon = 'bookOpen', title, children, action, onTitle }: { eyebrow: ReactNode; eyebrowIcon?: IconName; title: ReactNode; children?: ReactNode; action: ReactNode; onTitle?: () => void }) {
  return (
    <section className="bg-white rounded-[20px] border border-slate-200 shadow-lift p-5" data-testid="big-action">
      <div className="flex items-center gap-2 text-accent-700 font-bold mb-1"><Icon name={eyebrowIcon} size={20} />{eyebrow}</div>
      <h2 className="text-2xl font-bold mb-2">
        {onTitle ? <button type="button" className="text-left hover:underline decoration-2 underline-offset-4" onClick={onTitle}>{title}</button> : title}
      </h2>
      {children}
      <div className="mt-4">{action}</div>
    </section>
  );
}

/** Строка списка: иконка слева, заголовок, подпись, справа значение или стрелка. Вся строка — зона нажатия. */
export function ListItem({ icon, iconTone = 'brand', title, sub, right, onClick, children, testId }: {
  icon?: IconName | 'circleDashed'; iconTone?: 'brand' | 'ok' | 'neutral'; title: ReactNode; sub?: ReactNode; right?: ReactNode; onClick?: () => void; children?: ReactNode; testId?: string;
}) {
  const tone = { brand: 'bg-brand-50 text-brand-700', ok: 'bg-emerald-100 text-emerald-700', neutral: 'bg-slate-100 text-slate-600' }[iconTone];
  const body = (
    <>
      {icon && <span className={`w-12 h-12 shrink-0 rounded-xl flex items-center justify-center ${tone}`}><Icon name={icon} size={24} /></span>}
      <span className="flex-1 min-w-0">
        <span className="block font-semibold text-slate-900 leading-snug">{title}</span>
        {sub && <span className="block text-slate-600 mt-0.5">{sub}</span>}
        {children}
      </span>
      {right ?? (onClick && <Icon name="right" className="text-slate-500 shrink-0" />)}
    </>
  );
  const cls = 'w-full text-left flex items-center gap-3 bg-white rounded-2xl border border-slate-200 p-4 min-h-[72px]';
  return onClick
    ? <button type="button" data-testid={testId} className={`${cls} hover:border-brand-300 active:bg-brand-50`} onClick={onClick}>{body}</button>
    : <div data-testid={testId} className={cls}>{body}</div>;
}

// ---------------------------------------------------------------- заголовки, загрузка, пустые состояния
export function PageTitle({ children, actions, sub }: { children: ReactNode; actions?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div className="min-w-0">
        <h1 className="text-2xl md:text-[28px] font-bold text-slate-900">{children}</h1>
        {sub && <div className="text-slate-600 mt-1">{sub}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 text-slate-600 py-8 justify-center" role="status">
      <span className="w-7 h-7 border-4 border-brand-100 border-t-brand-600 rounded-full animate-spin" />
      {label ?? t('Загрузка…')}
    </div>
  );
}

/** Пустое состояние: что здесь будет и что сделать. */
export function EmptyState({ icon = 'book', title, children, action }: { icon?: IconName; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="text-center py-10 px-4 max-w-md mx-auto">
      <span className="w-20 h-20 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center mx-auto mb-4"><Icon name={icon} size={40} /></span>
      {title && <div className="text-xl font-bold text-slate-900 mb-1">{title}</div>}
      {children && <div className="text-slate-600">{children}</div>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function Empty({ icon = 'book', children }: { icon?: IconName; children: ReactNode }) {
  return <EmptyState icon={icon}>{children}</EmptyState>;
}

// ---------------------------------------------------------------- бейджи и статусы
export function Badge({ color = 'slate', children }: { color?: 'slate' | 'green' | 'red' | 'amber' | 'blue' | 'teal'; children: ReactNode }) {
  const c = {
    slate: 'bg-slate-100 text-slate-700', green: 'bg-emerald-100 text-emerald-800', red: 'bg-red-100 text-red-800',
    amber: 'bg-amber-100 text-amber-800', blue: 'bg-sky-100 text-sky-800', teal: 'bg-brand-50 text-brand-700',
  }[color];
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[0.9rem] font-semibold leading-tight ${c}`}>{children}</span>;
}

export type StatusKind = 'passed' | 'failed' | 'failed_final' | 'pending_review' | 'in_progress' | 'not_started' | 'overdue' | 'saved';
const STATUS_UI: Record<StatusKind, { label: string; icon: IconName | 'circleDashed'; cls: string }> = {
  passed: { label: 'Сдан', icon: 'checkCircle', cls: 'bg-emerald-100 text-emerald-800' },
  failed: { label: 'Не сдан — можно пересдать', icon: 'refresh', cls: 'bg-red-100 text-red-800' },
  failed_final: { label: 'Не сдан', icon: 'xCircle', cls: 'bg-red-100 text-red-800' },
  pending_review: { label: 'Ответ проверяет методист', icon: 'clock', cls: 'bg-amber-100 text-amber-800' },
  in_progress: { label: 'Начат', icon: 'play', cls: 'bg-sky-100 text-sky-800' },
  not_started: { label: 'Не начат', icon: 'circleDashed', cls: 'bg-slate-100 text-[#555555]' },
  overdue: { label: 'Срок прошёл', icon: 'alert', cls: 'bg-amber-100 text-amber-800' },
  saved: { label: 'Сохранено на телефоне', icon: 'phone', cls: 'bg-emerald-100 text-emerald-800' },
};

/** Статус: цвет + иконка + текст (различим и без цвета). */
export function StatusBadge({ status, label }: { status: StatusKind; label?: ReactNode }) {
  const { t } = useTranslation();
  const s = STATUS_UI[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[0.9rem] font-semibold leading-tight ${s.cls}`} data-status={status}>
      <Icon name={s.icon} size={16} strokeWidth={2.4} />{label ?? t(s.label)}
    </span>
  );
}

// ---------------------------------------------------------------- баннеры
type BannerKind = 'info' | 'error' | 'success' | 'warn' | 'offline';
const BANNER: Record<BannerKind, { cls: string; icon: IconName }> = {
  info: { cls: 'bg-sky-50 text-sky-900 border-sky-200', icon: 'info' },
  error: { cls: 'bg-red-50 text-red-900 border-red-200', icon: 'alert' },
  success: { cls: 'bg-emerald-50 text-emerald-900 border-emerald-200', icon: 'checkCircle' },
  warn: { cls: 'bg-amber-50 text-amber-900 border-amber-200', icon: 'alert' },
  offline: { cls: 'bg-brand-50 text-slate-800 border-brand-100', icon: 'wifiOff' },
};

export function Banner({ kind = 'info', children, title }: { kind?: BannerKind; children?: ReactNode; title?: ReactNode }) {
  const b = BANNER[kind];
  return (
    <div className={`border rounded-2xl px-4 py-3 flex gap-3 items-start ${b.cls}`} role={kind === 'error' ? 'alert' : 'status'}>
      <Icon name={b.icon} size={22} className="shrink-0 mt-0.5" />
      <div className="min-w-0">{title && <div className="font-bold">{title}</div>}{children}</div>
    </div>
  );
}

/** Совместимость: старое имя. */
export function Alert({ kind = 'info', children }: { kind?: 'info' | 'error' | 'success' | 'warn'; children: ReactNode }) {
  return <Banner kind={kind}>{children}</Banner>;
}

// ---------------------------------------------------------------- сеть
export function useOnline(): boolean {
  const [on, setOn] = useState(isOnline());
  useEffect(() => subscribeNetwork(setOn), []);
  return on;
}

/** Для экранов методиста и руководителя: без интернета показываем спокойное объяснение. */
export function NeedNetwork({ children }: { children: ReactNode }) {
  const online = useOnline();
  const { t } = useTranslation();
  if (online) return <>{children}</>;
  return (
    <EmptyState icon="wifiOff" title={t('Нужен интернет')}>
      {t('Этот раздел открывается только при подключении к интернету. Подключитесь и попробуйте снова.')}
    </EmptyState>
  );
}

// ---------------------------------------------------------------- модальные окна
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  const { t } = useTranslation();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" className={`bg-white w-full ${wide ? 'sm:max-w-4xl' : 'sm:max-w-lg'} rounded-t-[24px] sm:rounded-[20px] max-h-[92dvh] overflow-auto`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-200 sticky top-0 bg-white z-10">
          <h3 className="text-xl font-bold">{title}</h3>
          <button className="min-h-tap px-3 flex items-center gap-1 rounded-xl hover:bg-slate-100 text-slate-700 font-semibold" onClick={onClose}>
            <Icon name="x" />{t('Закрыть')}
          </button>
        </div>
        <div className="p-5 pb-[calc(1.25rem+var(--safe-bottom))] sm:pb-5">{children}</div>
      </div>
    </div>
  );
}

/** Подтверждение необратимого действия: две большие кнопки. */
export function ConfirmModal({ open, title, children, confirmText, cancelText, onConfirm, onCancel, onClose, danger }: {
  open: boolean; title: ReactNode; children?: ReactNode; confirmText: ReactNode; cancelText: ReactNode; onConfirm: () => void; onCancel: () => void;
  /** нажатие мимо окна; по умолчанию = onCancel */
  onClose?: () => void; danger?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose ?? onCancel}>
      <div role="alertdialog" aria-modal="true" className="bg-white w-full sm:max-w-md rounded-t-[24px] sm:rounded-[20px] p-5 pb-[calc(1.25rem+var(--safe-bottom))] sm:pb-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-xl font-bold mb-2">{title}</h3>
        {children && <div className="text-slate-700 mb-5">{children}</div>}
        <div className="flex flex-col gap-3">
          <Button big variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirmText}</Button>
          <Button big variant="secondary" onClick={onCancel}>{cancelText}</Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Toast
type ToastMsg = { kind: 'success' | 'error' | 'info'; text: ReactNode };
const ToastCtx = createContext<(kind: ToastMsg['kind'], text: ReactNode) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((kind: ToastMsg['kind'], text: ReactNode) => {
    setMsg({ kind, text });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 5000);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <div role="status" aria-live="polite" className="fixed z-[60] left-1/2 -translate-x-1/2 w-[min(92vw,30rem)] shadow-lift rounded-2xl"
          style={{ bottom: 'calc(var(--bottom-offset, 0px) + 1rem)' }}>
          <Banner kind={msg.kind}>{msg.text}</Banner>
        </div>
      )}
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

// ---------------------------------------------------------------- формы
export function Field({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block mb-4">
      <span className="block font-semibold text-slate-800 mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-[0.9rem] text-slate-600 mt-1">{hint}</span>}
    </label>
  );
}

export const inputCls = 'w-full rounded-xl border-2 border-slate-300 px-4 py-2 min-h-[3.25rem] text-lg focus:border-brand-600 focus:outline-none bg-white text-slate-900 placeholder:text-slate-400';

export function ProgressBar({ value, className = '', label }: { value: number; className?: string; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={`h-3 rounded-full bg-brand-100 overflow-hidden ${className}`} role="progressbar" aria-label={label} aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full bg-brand-600 rounded-full transition-all" style={{ width: `${v}%` }} />
    </div>
  );
}

// ---------------------------------------------------------------- форматирование
export function fmtDate(iso?: string | null, withTime = true) {
  if (!iso) return '';
  const d = new Date(iso);
  return withTime ? d.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : d.toLocaleDateString('ru-RU');
}

export function fmtDuration(sec: number) {
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h} ч ${m} мин` : m ? `${m} мин ${s % 60} с` : `${s % 60} с`;
}

/** Время простыми словами: «1 мин», «40 секунд». */
export function fmtHuman(sec: number) {
  const s = Math.max(0, Math.round(sec));
  if (s >= 3600) return `${Math.floor(s / 3600)} ч ${Math.round((s % 3600) / 60)} мин`;
  if (s >= 60) return `${Math.round(s / 60)} мин`;
  return `${s} сек`;
}

export function fmtBytes(b: number) {
  return b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} МБ` : `${Math.max(1, Math.round(b / 1024))} КБ`;
}

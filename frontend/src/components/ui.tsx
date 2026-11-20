import { type ButtonHTMLAttributes, type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isOnline, subscribeNetwork } from '../offline/network';
import { Icon, type IconName } from './Icon';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
const VARIANT: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-300',
  secondary: 'bg-white text-brand-700 border-2 border-brand-200 hover:bg-brand-50 disabled:opacity-50',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300',
  ghost: 'text-brand-700 hover:bg-brand-50 disabled:opacity-50',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-300',
};

export function Button({ variant = 'primary', icon, children, className = '', big, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; icon?: IconName; big?: boolean }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold min-h-tap px-4 transition-colors select-none disabled:cursor-not-allowed ${big ? 'text-lg py-3 w-full' : 'text-base py-2'} ${VARIANT[variant]} ${className}`}
      {...rest}
    >
      {icon && <Icon name={icon} size={big ? 24 : 20} />}
      {children}
    </button>
  );
}

export function Card({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={`bg-white rounded-2xl border border-slate-200 shadow-sm ${onClick ? 'cursor-pointer hover:border-brand-300 active:bg-brand-50' : ''} ${className}`}>
      {children}
    </div>
  );
}

export function PageTitle({ children, actions, sub }: { children: ReactNode; actions?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{children}</h1>
        {sub && <div className="text-slate-500 mt-1">{sub}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-slate-500 py-8 justify-center">
      <span className="w-6 h-6 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
      {label}
    </div>
  );
}

export function Empty({ icon = 'book', children }: { icon?: IconName; children: ReactNode }) {
  return (
    <div className="text-center text-slate-500 py-12 px-4">
      <Icon name={icon} size={48} className="mx-auto mb-3 text-slate-300" />
      <div className="text-lg">{children}</div>
    </div>
  );
}

export function Badge({ color = 'slate', children }: { color?: 'slate' | 'green' | 'red' | 'amber' | 'blue' | 'teal'; children: ReactNode }) {
  const c = {
    slate: 'bg-slate-100 text-slate-700', green: 'bg-emerald-100 text-emerald-800', red: 'bg-red-100 text-red-800',
    amber: 'bg-amber-100 text-amber-800', blue: 'bg-sky-100 text-sky-800', teal: 'bg-brand-100 text-brand-800',
  }[color];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-medium ${c}`}>{children}</span>;
}

export function Alert({ kind = 'info', children }: { kind?: 'info' | 'error' | 'success' | 'warn'; children: ReactNode }) {
  const c = { info: 'bg-sky-50 text-sky-900 border-sky-200', error: 'bg-red-50 text-red-900 border-red-200', success: 'bg-emerald-50 text-emerald-900 border-emerald-200', warn: 'bg-amber-50 text-amber-900 border-amber-200' }[kind];
  return <div className={`border rounded-xl px-4 py-3 ${c}`}>{children}</div>;
}

export function useOnline(): boolean {
  const [on, setOn] = useState(isOnline());
  useEffect(() => subscribeNetwork(setOn), []);
  return on;
}

/** Для экранов методиста и руководителя: офлайн показываем только предупреждение. */
export function NeedNetwork({ children }: { children: ReactNode }) {
  const online = useOnline();
  const { t } = useTranslation();
  if (online) return <>{children}</>;
  return (
    <div className="max-w-md mx-auto mt-12 text-center">
      <Icon name="wifiOff" size={56} className="mx-auto text-slate-400 mb-4" />
      <h2 className="text-xl font-bold mb-2">{t('Нужна сеть')}</h2>
      <p className="text-slate-600">{t('Этот раздел работает только при подключении к серверу.')}</p>
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className={`bg-white w-full ${wide ? 'sm:max-w-4xl' : 'sm:max-w-lg'} rounded-t-2xl sm:rounded-2xl max-h-[92dvh] overflow-auto`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white z-10">
          <h3 className="text-lg font-bold">{title}</h3>
          <button className="min-h-tap min-w-tap flex items-center justify-center rounded-xl hover:bg-slate-100" onClick={onClose} aria-label="Закрыть">
            <Icon name="x" />
          </button>
        </div>
        <div className="p-5 pb-[calc(1.25rem+var(--safe-bottom))] sm:pb-5">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block mb-3">
      <span className="block text-sm font-semibold text-slate-700 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-500 mt-1">{hint}</span>}
    </label>
  );
}

export const inputCls = 'w-full rounded-xl border-2 border-slate-200 px-3 py-2 min-h-tap text-base focus:border-brand-500 focus:outline-none bg-white';

export function ProgressBar({ value, className = '' }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={`h-3 rounded-full bg-slate-100 overflow-hidden ${className}`} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full bg-brand-500 transition-all" style={{ width: `${v}%` }} />
    </div>
  );
}

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

export function fmtBytes(b: number) {
  return b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} МБ` : `${Math.max(1, Math.round(b / 1024))} КБ`;
}

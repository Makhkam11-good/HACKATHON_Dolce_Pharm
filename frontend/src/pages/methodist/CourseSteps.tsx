import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon';

/** Пошаговый редактор курса: 1. Описание → 2. Материалы → 3. Тест → 4. Назначение. */
export function CourseSteps({ courseId, current, done = [] }: { courseId: string; current: 1 | 2 | 3 | 4; done?: number[] }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const steps: { n: 1 | 2 | 3 | 4; label: string; go: () => void }[] = [
    { n: 1, label: 'Описание', go: () => (current <= 2 ? document.getElementById('step-1')?.scrollIntoView({ behavior: 'smooth' }) : nav(`/m/courses/${courseId}`)) },
    { n: 2, label: 'Материалы', go: () => (current <= 2 ? document.getElementById('step-2')?.scrollIntoView({ behavior: 'smooth' }) : nav(`/m/courses/${courseId}#step-2`)) },
    { n: 3, label: 'Тест', go: () => nav(`/m/courses/${courseId}/test`) },
    { n: 4, label: 'Назначение', go: () => nav(`/m/assignments?course=${courseId}`) },
  ];
  return (
    <nav aria-label={t('Шаги создания курса')} className="mb-5">
      <ol className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {steps.map((s) => {
          const active = s.n === current || (current <= 2 && s.n <= 2);
          const ok = done.includes(s.n);
          return (
            <li key={s.n}>
              <button type="button" onClick={s.go} aria-current={s.n === current ? 'step' : undefined}
                className={`w-full min-h-tap rounded-xl px-3 py-2 flex items-center gap-2 font-semibold border-2 text-left ${active ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-slate-200 bg-white text-slate-700 hover:border-brand-400'}`}>
                <span className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center ${ok ? 'bg-emerald-600 text-white' : active ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                  {ok ? <Icon name="check" size={18} strokeWidth={3} /> : s.n}
                </span>
                {t(s.label)}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

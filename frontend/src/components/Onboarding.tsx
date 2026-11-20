import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './ui';

const KEY = (userId: string) => `onboarding:v1:${userId}`;

export function onboardingSeen(userId: string): boolean {
  try {
    // onboarding:skip — для автотестов и стендов
    return localStorage.getItem(KEY(userId)) === '1' || localStorage.getItem('onboarding:skip') === '1';
  } catch {
    return true; // без localStorage не мешаем работе
  }
}

function markSeen(userId: string) {
  try {
    localStorage.setItem(KEY(userId), '1');
  } catch {
    /* ignore */
  }
}

/* Иллюстрации — простые формы в цветах бренда (фиолетовый, coral как декор). */
function ArtLearn() {
  return (
    <svg viewBox="0 0 240 180" className="w-full h-full" aria-hidden="true">
      <circle cx="120" cy="92" r="78" fill="#F5EEF9" />
      <rect x="78" y="22" width="84" height="146" rx="16" fill="#4F007D" />
      <rect x="86" y="36" width="68" height="112" rx="8" fill="#fff" />
      <rect x="96" y="50" width="48" height="8" rx="4" fill="#D5B9E6" />
      <rect x="96" y="66" width="38" height="6" rx="3" fill="#E5E2E9" />
      <rect x="96" y="80" width="44" height="6" rx="3" fill="#E5E2E9" />
      <rect x="96" y="104" width="48" height="10" rx="5" fill="#EADCF2" />
      <rect x="96" y="104" width="30" height="10" rx="5" fill="#4F007D" />
      <rect x="96" y="124" width="48" height="16" rx="8" fill="#4F007D" />
      <circle cx="176" cy="46" r="16" fill="#E56D6D" />
      <path d="M169 46l5 5 9-10" stroke="#fff" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArtOffline() {
  return (
    <svg viewBox="0 0 240 180" className="w-full h-full" aria-hidden="true">
      <circle cx="120" cy="92" r="78" fill="#F5EEF9" />
      <rect x="62" y="34" width="70" height="124" rx="14" fill="#4F007D" />
      <rect x="69" y="46" width="56" height="96" rx="7" fill="#fff" />
      <path d="M84 86l9 9 18-20" stroke="#1B7D45" strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <g transform="translate(150 54)">
        <path d="M6 30a24 24 0 0 1 48 0" stroke="#6F6878" strokeWidth="6" fill="none" strokeLinecap="round" />
        <path d="M17 38a13 13 0 0 1 26 0" stroke="#6F6878" strokeWidth="6" fill="none" strokeLinecap="round" />
        <circle cx="30" cy="48" r="5" fill="#6F6878" />
        <path d="M2 2l56 56" stroke="#E56D6D" strokeWidth="6" strokeLinecap="round" />
      </g>
    </svg>
  );
}

function ArtMaster() {
  return (
    <svg viewBox="0 0 240 180" className="w-full h-full" aria-hidden="true">
      <circle cx="120" cy="92" r="78" fill="#F5EEF9" />
      <rect x="128" y="50" width="92" height="62" rx="8" fill="#4F007D" />
      <rect x="135" y="57" width="78" height="48" rx="4" fill="#fff" />
      <rect x="116" y="112" width="116" height="10" rx="5" fill="#350054" />
      <circle cx="174" cy="81" r="10" fill="#EADCF2" /><circle cx="174" cy="81" r="4" fill="#4F007D" />
      <rect x="24" y="40" width="64" height="112" rx="13" fill="#4F007D" />
      <rect x="31" y="52" width="50" height="86" rx="6" fill="#fff" />
      <g fill="#201E1E">
        <rect x="38" y="62" width="14" height="14" rx="2" /><rect x="60" y="62" width="14" height="14" rx="2" />
        <rect x="38" y="84" width="14" height="14" rx="2" /><rect x="62" y="86" width="5" height="5" /><rect x="69" y="93" width="5" height="5" />
      </g>
      <rect x="38" y="108" width="36" height="8" rx="4" fill="#4F007D" />
      <path d="M96 96h22" stroke="#E56D6D" strokeWidth="5" strokeLinecap="round" strokeDasharray="2 9" />
    </svg>
  );
}

const SLIDES = [
  { art: ArtLearn, title: 'Обучение на телефоне', text: 'Здесь ваши курсы по технике безопасности и работе на производстве. Читайте, смотрите видео и сдавайте тест.' },
  { art: ArtOffline, title: 'Можно учиться без интернета', text: 'Нажмите «Сохранить на телефон», пока есть интернет. Потом курс откроется и в цеху без связи. Ответы сохранятся и отправятся сами.' },
  { art: ArtMaster, title: 'Если интернета нет совсем', text: 'Передайте результаты мастеру: покажите экран телефона камере его компьютера. Ничего не потеряется.' },
];

/** Три простых экрана при первом входе сотрудника. */
export function Onboarding({ userId, onDone }: { userId: string; onDone: () => void }) {
  const { t } = useTranslation();
  const [i, setI] = useState(0);
  const finish = () => {
    markSeen(userId);
    onDone();
  };
  const s = SLIDES[i];
  const Art = s.art;
  const last = i === SLIDES.length - 1;
  return (
    <div className="fixed inset-0 z-[70] bg-white flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]" role="dialog" aria-modal="true" aria-label={t('Знакомство с приложением')}>
      <div className="flex justify-between items-center px-4 py-2">
        <span className="text-slate-600 font-semibold">{i + 1} {t('из')} {SLIDES.length}</span>
        <Button variant="ghost" onClick={finish}>{t('Пропустить')}</Button>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center max-w-md mx-auto w-full">
        <div className="w-full max-w-[18rem] aspect-[4/3] mb-6"><Art /></div>
        <h1 className="text-[1.75rem] font-bold mb-3">{t(s.title)}</h1>
        <p className="text-lg text-slate-700">{t(s.text)}</p>
        <div className="flex gap-2 mt-6" aria-hidden="true">
          {SLIDES.map((_, k) => <span key={k} className={`h-2.5 rounded-full transition-all ${k === i ? 'w-8 bg-brand-600' : 'w-2.5 bg-slate-300'}`} />)}
        </div>
      </div>
      <div className="px-4 pb-4 max-w-md mx-auto w-full">
        <Button big icon={last ? 'check' : 'right'} onClick={() => (last ? finish() : setI(i + 1))}>{last ? t('Начать обучение') : t('Далее')}</Button>
      </div>
    </div>
  );
}

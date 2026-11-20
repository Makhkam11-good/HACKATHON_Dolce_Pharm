import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';

/** Карусель QR-кодов: 1 с на код (уровень коррекции L — крупнее модули, легче читать с веб-камеры), пауза/назад/вперёд, «Код 2 из 5». */
export function QrCarousel({ chunks, interval = 1000 }: { chunks: string[]; interval?: number }) {
  const { t } = useTranslation();
  const [urls, setUrls] = useState<string[]>([]);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let alive = true;
    void Promise.all(chunks.map((c) => QRCode.toDataURL(c, { errorCorrectionLevel: 'L', margin: 4, width: 720, color: { dark: '#000000', light: '#ffffff' } }))).then((u) => {
      if (alive) {
        setUrls(u);
        setI(0);
      }
    });
    return () => {
      alive = false;
    };
  }, [chunks]);

  useEffect(() => {
    if (paused || urls.length < 2) return;
    const iv = setInterval(() => setI((x) => (x + 1) % urls.length), interval);
    return () => clearInterval(iv);
  }, [paused, urls.length, interval]);

  if (!urls.length) return <div className="text-center py-10 text-slate-500">{t('Готовим коды…')}</div>;
  return (
    <div className="flex flex-col items-center">
      <div className="bg-white p-2 rounded-2xl shadow-lift border border-slate-200 w-full max-w-[520px]">
        <img src={urls[i]} alt={`${t('Код')} ${i + 1}`} className="block w-full h-auto" style={{ imageRendering: 'pixelated' }} />
      </div>
      <div className="text-2xl font-bold mt-3">{t('Код')} {i + 1} {t('из')} {urls.length}</div>
      <div className="flex gap-1 mt-2 flex-wrap justify-center">
        {urls.map((_, k) => <span key={k} className={`w-3 h-3 rounded-full ${k === i ? 'bg-brand-600' : 'bg-slate-300'}`} />)}
      </div>
      <div className="grid grid-cols-3 gap-3 mt-3 w-full max-w-[520px]">
        <button className="min-h-tap px-2 rounded-xl border-2 border-slate-300 bg-white font-semibold flex items-center justify-center gap-1" onClick={() => { setPaused(true); setI((x) => (x - 1 + urls.length) % urls.length); }}><Icon name="left" />{t('Назад')}</button>
        <button className="min-h-tap px-2 rounded-xl border-2 border-slate-300 bg-white font-semibold flex items-center justify-center gap-1" onClick={() => setPaused((p) => !p)}>
          <Icon name={paused ? 'play' : 'pause'} />{paused ? t('Дальше') : t('Пауза')}
        </button>
        <button className="min-h-tap px-2 rounded-xl border-2 border-slate-300 bg-white font-semibold flex items-center justify-center gap-1" onClick={() => { setPaused(true); setI((x) => (x + 1) % urls.length); }}>{t('Вперёд')}<Icon name="right" /></button>
      </div>
      <div className="text-slate-700 mt-3 flex items-center gap-2"><Icon name="sun" className="text-amber-700 shrink-0" />{t('Сделайте экран ярче и держите телефон напротив камеры мастера')}</div>
    </div>
  );
}

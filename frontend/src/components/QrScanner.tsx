import jsQR from 'jsqr';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from './ui';

/** Камера → canvas → jsQR каждые ~150 мс. onResult вызывается для каждого распознанного кода. */
export function QrScanner({ onResult, active = true }: { onResult: (text: string) => void; active?: boolean }) {
  const { t } = useTranslation();
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [err, setErr] = useState('');
  const cb = useRef(onResult);
  cb.current = onResult;

  useEffect(() => {
    if (!active) return;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;
    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error(t('Камера недоступна: нужен HTTPS или localhost'));
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        if (stopped) return;
        const v = video.current!;
        v.srcObject = stream;
        v.setAttribute('playsinline', 'true');
        await v.play();
        timer = setInterval(() => {
          const c = canvas.current;
          if (!c || v.readyState < 2) return;
          const w = v.videoWidth;
          const h = v.videoHeight;
          if (!w || !h) return;
          const scale = Math.min(1, 960 / Math.max(w, h));
          c.width = Math.round(w * scale);
          c.height = Math.round(h * scale);
          const ctx = c.getContext('2d', { willReadFrequently: true })!;
          ctx.drawImage(v, 0, 0, c.width, c.height);
          const img = ctx.getImageData(0, 0, c.width, c.height);
          const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
          if (code?.data) cb.current(code.data);
        }, 150);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [active, t]);

  return (
    <div>
      {err && <Alert kind="error">{t('Не удалось включить камеру')}: {err}</Alert>}
      <div className="relative rounded-2xl overflow-hidden bg-black aspect-video max-w-2xl">
        <video ref={video} muted className="w-full h-full object-cover" />
        <div className="absolute inset-[12%] border-4 border-white/70 rounded-2xl pointer-events-none" />
      </div>
      <canvas ref={canvas} className="hidden" />
    </div>
  );
}

import jsQR from 'jsqr';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';
import { Alert, Button, inputCls } from './ui';

type TFn = (k: string) => string;

/** Человеческий текст вместо «тишины» или технического имени ошибки getUserMedia. */
export function cameraErrorText(e: unknown, t: TFn): string {
  const name = (e as { name?: string })?.name || '';
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    return t('Камера работает только по HTTPS или на localhost. Откройте https://localhost или адрес туннеля');
  }
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    return t('Доступ к камере запрещён. Разрешите камеру в настройках сайта (значок замка в адресной строке) и в настройках Windows: Конфиденциальность → Камера');
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') return t('Камера не найдена');
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    return t('Камера занята другим приложением (Zoom, Teams, OBS)');
  }
  if (name === 'CameraTimeout') {
    return t('Камера не отвечает: Windows не отдаёт видео браузеру, поэтому окно «Разрешить» не появляется. Закройте программы, которые используют камеру (NVIDIA Broadcast, iVCam, OBS, Discord, Zoom), и перезапустите браузер. Если не помогло — перезагрузите компьютер. Пока можно принять коды через «Загрузить фото кодов».');
  }
  return `${t('Не удалось включить камеру')}: ${(e as Error)?.message || String(e)}`;
}

/** Если браузер или Windows зависли на опросе камер, getUserMedia не завершается никогда — ждём не дольше этого. */
const CAMERA_TIMEOUT_MS = 12000;

/** getUserMedia с таймаутом. Поток, пришедший после таймаута, сразу закрываем, чтобы камера не осталась включённой. */
function getUserMediaWithTimeout(constraints: MediaStreamConstraints): Promise<MediaStream> {
  let timedOut = false;
  const gum = navigator.mediaDevices.getUserMedia(constraints);
  gum.then((s) => timedOut && s.getTracks().forEach((tr) => tr.stop())).catch(() => undefined);
  return Promise.race([
    gum,
    new Promise<never>((_, reject) => setTimeout(() => {
      timedOut = true;
      reject(Object.assign(new Error('camera timeout'), { name: 'CameraTimeout' }));
    }, CAMERA_TIMEOUT_MS)),
  ]);
}

/** Разрешение уже заблокировано для сайта? Тогда браузер не покажет окно повторно — объясняем сразу. */
async function cameraBlocked(): Promise<boolean> {
  try {
    return (await navigator.permissions?.query({ name: 'camera' as PermissionName }))?.state === 'denied';
  } catch {
    return false; // Safari/Firefox могут не знать имя 'camera'
  }
}

/**
 * Веб-камера → canvas → jsQR каждые ~150 мс. onResult вызывается для каждого распознанного кода.
 * getUserMedia вызывается только по нажатию «Включить камеру» (жест пользователя) либо при autoStart
 * (телефон, экран открыт кнопкой). На ПК facingMode не требуем — используем { video: true } или выбранный deviceId.
 */
export function QrScanner({ onResult, active = true, autoStart = false, preferBack = false }: {
  onResult: (text: string) => void; active?: boolean; autoStart?: boolean; preferBack?: boolean;
}) {
  const { t } = useTranslation();
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [state, setState] = useState<'idle' | 'starting' | 'running'>('idle');
  const [err, setErr] = useState('');
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const [camId, setCamId] = useState('');
  const cb = useRef(onResult);
  cb.current = onResult;

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((tr) => tr.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setState('idle');
  }, []);

  const start = useCallback(async (deviceId?: string) => {
    setErr('');
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setErr(t('Камера работает только по HTTPS или на localhost. Откройте https://localhost или адрес туннеля'));
      return;
    }
    stop();
    if (await cameraBlocked()) {
      setErr(cameraErrorText({ name: 'NotAllowedError' }, t));
      return;
    }
    setState('starting');
    try {
      const constraints: MediaStreamConstraints = {
        audio: false,
        video: {
          ...(deviceId ? { deviceId: { exact: deviceId } } : preferBack ? { facingMode: { ideal: 'environment' } } : {}),
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      };
      const s = await getUserMediaWithTimeout(constraints);
      stream.current = s;
      const v = video.current!;
      v.srcObject = s;
      v.setAttribute('playsinline', 'true');
      await v.play();
      setState('running');
      // названия камер доступны только после выдачи разрешения
      try {
        const list = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
        setCams(list);
        setCamId(s.getVideoTracks()[0]?.getSettings().deviceId || deviceId || '');
      } catch {
        /* список камер не обязателен */
      }
      timer.current = setInterval(() => {
        const c = canvas.current;
        if (!c || v.readyState < 2) return;
        const w = v.videoWidth;
        const h = v.videoHeight;
        if (!w || !h) return;
        const scale = Math.min(1, 1280 / Math.max(w, h));
        c.width = Math.round(w * scale);
        c.height = Math.round(h * scale);
        const ctx = c.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(v, 0, 0, c.width, c.height);
        const img = ctx.getImageData(0, 0, c.width, c.height);
        const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        if (code?.data) cb.current(code.data);
      }, 150);
    } catch (e) {
      stop();
      setErr(cameraErrorText(e, t));
    }
  }, [preferBack, stop, t]);

  useEffect(() => {
    if (active && autoStart) void start();
    return stop;
  }, [active, autoStart]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!active) stop();
  }, [active, stop]);

  return (
    <div className="space-y-2">
      {err && <Alert kind="error">{err}</Alert>}
      <div className="relative rounded-2xl overflow-hidden bg-slate-900 aspect-video max-w-2xl">
        <video ref={video} muted playsInline className={`w-full h-full object-cover ${state === 'running' ? '' : 'invisible'}`} />
        {state === 'running' && <div className="absolute inset-[12%] border-4 border-white/80 rounded-2xl pointer-events-none" />}
        {state !== 'running' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
            <Icon name="camera" size={40} className="text-white/70" />
            <Button big icon="camera" disabled={state === 'starting' || !active} onClick={() => void start(camId || undefined)}>
              {state === 'starting' ? t('Включаем камеру…') : t('Включить камеру')}
            </Button>
            <div className="text-white/90">{t('Браузер спросит разрешение на камеру — нажмите «Разрешить»')}</div>
          </div>
        )}
      </div>
      {state === 'running' && (
        <div className="flex flex-wrap items-center gap-2">
          {cams.length > 1 && (
            <select className={`${inputCls} max-w-xs`} value={camId} onChange={(e) => { setCamId(e.target.value); void start(e.target.value); }} aria-label={t('Камера')}>
              {cams.map((c, i) => <option key={c.deviceId || i} value={c.deviceId}>{c.label || `${t('Камера')} ${i + 1}`}</option>)}
            </select>
          )}
          <Button variant="secondary" icon="x" onClick={stop}>{t('Выключить камеру')}</Button>
        </div>
      )}
      <canvas ref={canvas} className="hidden" />
    </div>
  );
}

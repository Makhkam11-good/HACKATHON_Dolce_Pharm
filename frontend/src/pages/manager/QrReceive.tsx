import pako from 'pako';
import QRCode from 'qrcode';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError, errorText } from '../../api/client';
import { QrScanner } from '../../components/QrScanner';
import { Alert, Button, Card, inputCls, PageTitle } from '../../components/ui';
import { b64urlDecode, b64urlEncode } from '../../offline/qrExport';
import { decodeQrImage, QrAssembler, splitManual } from '../../offline/qrReceiver';

interface QrResult {
  user_name: string; accepted_count: number; duplicates_count: number; already_received: boolean; batch_id: string; ack: string;
  stats: { events: number; attempts: number; assessment_responses: number; scenario_runs: number };
  attempts: { course_title: string; status: string; score: number; user_name: string; certificate_number: string | null }[];
  rejected: { id: string; reason: string }[];
}
const ST: Record<string, string> = { passed: 'сдал', failed: 'не сдал', pending_review: 'на проверке' };

function shortName(full: string) {
  const [f, i] = full.split(' ');
  return i ? `${f} ${i[0]}.` : full;
}

export default function QrReceive() {
  const { t } = useTranslation();
  const asm = useRef(new QrAssembler());
  const [, force] = useState(0);
  const [result, setResult] = useState<QrResult | null>(null);
  const [ackUrl, setAckUrl] = useState('');
  const [err, setErr] = useState('');
  const [warn, setWarn] = useState('');
  const [info, setInfo] = useState('');
  const [manual, setManual] = useState('');
  const [sending, setSending] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const a = asm.current;

  const reset = () => {
    a.reset();
    setResult(null);
    setAckUrl('');
    setErr('');
    setWarn('');
    setInfo('');
    force((x) => x + 1);
  };

  const send = async (bid: string, data: string) => {
    setSending(true);
    setErr('');
    try {
      const r = await api<QrResult>('/api/sync/qr', { body: { batch_id: bid, data }, timeout: 60000 });
      setResult(r);
      setAckUrl(await QRCode.toDataURL(r.ack, { errorCorrectionLevel: 'M', margin: 4, width: 420 }));
    } catch (e) {
      setErr(e instanceof ApiError && e.code === 'bad_signature' ? t('Подпись не совпала — пакет изменён или подделан. Данные не приняты.') : errorText(e));
    } finally {
      setSending(false);
    }
  };

  /** Один распознанный код — с камеры, фото или из ручного ввода. Возвращает, был ли это код пакета. */
  const onCode = (text: string): boolean => {
    if (a.full || sending) return false;
    const r = a.add(text);
    if (r.status === 'ignored') return false;
    if (r.status !== 'duplicate') {
      if (r.droppedPrevious) setWarn(t('Начат новый пакет — предыдущая незавершённая сборка сброшена'));
      force((x) => x + 1);
      if (r.status === 'complete') void send(r.batchId, r.full);
    }
    return true;
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setErr('');
    let ok = 0;
    for (const f of Array.from(files)) {
      try {
        const text = await decodeQrImage(f);
        if (text && onCode(text)) ok++;
      } catch {
        /* не картинка */
      }
    }
    setInfo(t('Распознано кодов на фото: {{ok}} из {{n}}', { ok, n: files.length }));
    if (fileInput.current) fileInput.current.value = '';
  };

  const onManual = () => {
    const codes = splitManual(manual);
    const ok = codes.filter((c) => onCode(c)).length;
    setInfo(ok ? t('Добавлено кодов: {{n}}', { n: ok }) : t('Код не распознан: строка должна начинаться с DPQR1|'));
    if (ok) setManual('');
  };

  /** Демо для жюри: «накручиваем» данные пакета (время ×10, балл 100%) и отправляем с прежней подписью. */
  const forge = () => {
    if (!a.full || !a.batchId) return;
    const [p, s] = a.full.split('.');
    const packet = JSON.parse(new TextDecoder().decode(pako.inflate(b64urlDecode(p))));
    for (const it of packet.items) {
      if (it.kind === 'event') it.payload.duration_ms = (it.payload.duration_ms || 0) * 10;
      if (it.kind === 'attempt') it.payload.client_score = 100;
    }
    const forged = pako.deflate(new TextEncoder().encode(JSON.stringify(packet)));
    void send(a.batchId, `${b64urlEncode(forged)}.${s}`);
  };

  const n = a.n;
  return (
    <div className="max-w-5xl">
      <PageTitle
        sub={t('Оператор открывает на телефоне «Передать мастеру без сети» и показывает QR-коды камере этого компьютера')}
        actions={<Button variant="secondary" icon="refresh" onClick={reset}>{t('Новый приём')}</Button>}
      >
        {t('Принять по QR')}
      </PageTitle>
      {warn && <div className="mb-3"><Alert kind="warn">{warn}</Alert></div>}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="space-y-4">
          <QrScanner onResult={(txt) => void onCode(txt)} active={!result} />
          <Card className="p-4 space-y-3">
            <div className="font-semibold">{t('Если камера не работает')}</div>
            <div>
              <input ref={fileInput} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void onFiles(e.target.files)} />
              <Button variant="secondary" icon="image" disabled={!!result} onClick={() => fileInput.current?.click()}>{t('Загрузить фото/скриншот QR')}</Button>
              <div className="text-xs text-slate-500 mt-1">{t('Можно выбрать сразу несколько снимков — по одному на каждый код карусели.')}</div>
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="qr-manual">{t('Вставить код вручную')}</label>
              <textarea id="qr-manual" className={`${inputCls} mt-1 font-mono text-xs`} rows={3} value={manual} onChange={(e) => setManual(e.target.value)} placeholder="DPQR1|…" />
              <Button variant="secondary" className="mt-2" disabled={!manual.trim() || !!result} onClick={onManual}>{t('Добавить')}</Button>
              <div className="text-xs text-slate-500 mt-1">{t('На телефоне оператора: «Скопировать код» рядом с каруселью.')}</div>
            </div>
            {info && <div className="text-sm text-slate-600">{info}</div>}
          </Card>
        </div>
        <Card className="p-4 self-start">
          {!a.batchId ? <div className="text-slate-500 text-lg">{t('Ожидание первого кода…')}</div> : (
            <>
              <div className="text-xl font-bold mb-2">{t('Собрано')} {a.got} {t('из')} {n}</div>
              <div className="text-sm text-slate-500 mb-3">{t('Пакет')} <span className="font-mono">{a.batchId}</span></div>
              <div className="grid gap-1.5 mb-4" style={{ gridTemplateColumns: `repeat(${Math.min(n, 8)}, minmax(0, 1fr))` }}>
                {Array.from({ length: n }, (_, i) => (
                  <div key={i} data-chunk={i + 1} className={`h-10 rounded-lg flex items-center justify-center font-bold ${a.has(i + 1) ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'}`}>{i + 1}</div>
                ))}
              </div>
            </>
          )}
          {sending && <Alert kind="info">{t('Отправка на сервер…')}</Alert>}
          {err && <Alert kind="error">{err}</Alert>}
          {result && (
            <div className="space-y-3">
              <Alert kind="success">
                <div className="font-bold text-lg">{result.already_received ? t('Пакет уже был принят ранее') : t('Принято')}: {result.stats?.events ?? 0} {t('событий')}, {result.stats?.attempts ?? 0} {t('попыток теста')}</div>
                {result.attempts.map((x, i) => <div key={i}>{shortName(x.user_name)} — {x.course_title} — {t(ST[x.status] || x.status)}, {x.score}%{x.certificate_number ? ` · ${x.certificate_number}` : ''}</div>)}
                {result.duplicates_count > 0 && <div className="text-sm">{t('Дубли (уже были на сервере)')}: {result.duplicates_count}</div>}
              </Alert>
              {result.rejected?.length > 0 && <Alert kind="warn">{t('Отклонено')}: {result.rejected.map((r) => r.reason).join(', ')}</Alert>}
              {ackUrl && (
                <div className="text-center border rounded-2xl p-3">
                  <div className="font-semibold mb-1">{t('Подтверждение для телефона (необязательно)')}</div>
                  <img src={ackUrl} alt="ACK" className="mx-auto w-64" />
                  <div className="text-xs text-slate-500">{t('Оператор: «Сканировать подтверждение мастера»')}</div>
                </div>
              )}
            </div>
          )}
          {a.full && <Button variant="danger" icon="alert" className="mt-3" disabled={sending} onClick={forge}>{t('Демо: отправить изменённый пакет')}</Button>}
        </Card>
      </div>
    </div>
  );
}

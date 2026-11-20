import pako from 'pako';
import QRCode from 'qrcode';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError, errorText } from '../../api/client';
import { QrScanner } from '../../components/QrScanner';
import { Alert, Button, Card, inputCls, PageTitle } from '../../components/ui';
import { assemble, b64urlDecode, b64urlEncode, parseChunk } from '../../offline/qrExport';

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
  const [batch, setBatch] = useState<{ id: string; n: number } | null>(null);
  const chunks = useRef(new Map<number, string>());
  const [, force] = useState(0);
  const [full, setFull] = useState<string | null>(null);
  const [result, setResult] = useState<QrResult | null>(null);
  const [ackUrl, setAckUrl] = useState('');
  const [err, setErr] = useState('');
  const [warn, setWarn] = useState('');
  const [manual, setManual] = useState('');
  const [sending, setSending] = useState(false);

  const reset = () => {
    chunks.current = new Map();
    setBatch(null);
    setFull(null);
    setResult(null);
    setAckUrl('');
    setErr('');
    setWarn('');
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

  const onScan = (text: string) => {
    if (full || sending) return;
    const ch = parseChunk(text);
    if (!ch) return;
    if (!batch || batch.id !== ch.batchId) {
      if (batch && chunks.current.size) setWarn(t('Начат новый пакет — предыдущая незавершённая сборка сброшена'));
      chunks.current = new Map();
      setBatch({ id: ch.batchId, n: ch.n });
    }
    if (!chunks.current.has(ch.i)) {
      chunks.current.set(ch.i, ch.data);
      force((x) => x + 1);
      const s = assemble(chunks.current, ch.n);
      if (s) {
        setFull(s);
        void send(ch.batchId, s);
      }
    }
  };

  /** Демо для жюри: «накручиваем» данные пакета (время ×10, балл 100%) и отправляем с прежней подписью. */
  const forge = () => {
    if (!full || !batch) return;
    const [p, s] = full.split('.');
    const packet = JSON.parse(new TextDecoder().decode(pako.inflate(b64urlDecode(p))));
    for (const it of packet.items) {
      if (it.kind === 'event') it.payload.duration_ms = (it.payload.duration_ms || 0) * 10;
      if (it.kind === 'attempt') it.payload.client_score = 100;
    }
    packet.batch_id = batch.id;
    const forged = pako.deflate(new TextEncoder().encode(JSON.stringify(packet)));
    void send(batch.id, `${b64urlEncode(forged)}.${s}`);
  };

  const onManual = () => {
    manual.split(/\s+/).filter(Boolean).forEach(onScan);
    setManual('');
  };

  const n = batch?.n || 0;
  const got = chunks.current.size;
  return (
    <div className="max-w-4xl">
      <PageTitle sub={t('Наведите камеру ноутбука на телефон оператора с QR-каруселью')} actions={<Button variant="secondary" icon="refresh" onClick={reset}>{t('Новый приём')}</Button>}>{t('Принять по QR')}</PageTitle>
      {warn && <div className="mb-3"><Alert kind="warn">{warn}</Alert></div>}
      <div className="grid lg:grid-cols-2 gap-4">
        <div>
          <QrScanner onResult={onScan} active={!result} />
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-slate-500">{t('Ввести данные вручную (отладка)')}</summary>
            <textarea className={`${inputCls} mt-2 font-mono text-xs`} rows={3} value={manual} onChange={(e) => setManual(e.target.value)} placeholder="DPQR1|…" />
            <Button variant="secondary" className="mt-2" onClick={onManual}>{t('Добавить')}</Button>
          </details>
        </div>
        <Card className="p-4">
          {!batch ? <div className="text-slate-500 text-lg">{t('Ожидание первого кода…')}</div> : (
            <>
              <div className="text-xl font-bold mb-2">{t('Собрано')} {got} {t('из')} {n}</div>
              <div className="text-sm text-slate-500 mb-3">{t('Пакет')} <span className="font-mono">{batch.id}</span></div>
              <div className="grid gap-1.5 mb-4" style={{ gridTemplateColumns: `repeat(${Math.min(n, 8)}, minmax(0, 1fr))` }}>
                {Array.from({ length: n }, (_, i) => (
                  <div key={i} className={`h-10 rounded-lg flex items-center justify-center font-bold ${chunks.current.has(i + 1) ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'}`}>{i + 1}</div>
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
                {result.attempts.map((a, i) => <div key={i}>{shortName(a.user_name)} — {a.course_title} — {t(ST[a.status] || a.status)}, {a.score}%{a.certificate_number ? ` · ${a.certificate_number}` : ''}</div>)}
                {result.duplicates_count > 0 && <div className="text-sm">{t('Дубли (уже были на сервере)')}: {result.duplicates_count}</div>}
              </Alert>
              {result.rejected?.length > 0 && <Alert kind="warn">{t('Отклонено')}: {result.rejected.map((r) => r.reason).join(', ')}</Alert>}
              {ackUrl && (
                <div className="text-center border rounded-2xl p-3">
                  <div className="font-semibold mb-1">{t('Подтверждение для телефона')}</div>
                  <img src={ackUrl} alt="ACK" className="mx-auto w-64" />
                  <div className="text-xs text-slate-500">{t('Оператор: «Сканировать подтверждение»')}</div>
                </div>
              )}
              <Button variant="danger" icon="alert" onClick={forge}>{t('Демо: отправить изменённый пакет')}</Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

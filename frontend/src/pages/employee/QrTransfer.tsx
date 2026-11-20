import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth';
import { Icon } from '../../components/Icon';
import { QrCarousel } from '../../components/QrCarousel';
import { QrScanner } from '../../components/QrScanner';
import { Alert, Button, Card, PageTitle } from '../../components/ui';
import { db, setMeta } from '../../offline/db';
import { getDevice } from '../../offline/device';
import { applyAck, verifyAck } from '../../offline/qrAck';
import { buildPacket } from '../../offline/qrExport';

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // запасной путь для старых WebView
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export default function QrTransfer() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const items = useLiveQuery(() => (user ? db.outbox.where('[userId+status]').equals([user.id, 'pending']).toArray() : []), [user?.id], []);
  const waiting = useLiveQuery(() => (user ? db.outbox.where('[userId+status]').equals([user.id, 'sent_qr']).count() : 0), [user?.id], 0);
  const [batch, setBatch] = useState<{ id: string; chunks: string[]; ids: string[]; kinds: Record<string, number> } | null>(null);
  const [shown, setShown] = useState(false); // коды уже показывали — можно сканировать подтверждение
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const [scanAck, setScanAck] = useState(false);

  const build = async () => {
    setErr('');
    setMsg('');
    const dev = await getDevice(user!.id);
    if (!dev) {
      setErr(t('Телефон ещё не подключён: войдите в приложение хотя бы раз, когда есть интернет.'));
      return;
    }
    const list = items || [];
    const { chunks, batchId } = await buildPacket(list, dev.deviceId, user!.id, dev.secretB64);
    const ids = list.map((i) => i.id);
    await db.outbox.where('id').anyOf(ids).modify({ qrBatch: batchId });
    await setMeta(`qrBatch:${batchId}`, ids);
    const kinds: Record<string, number> = {};
    list.forEach((i) => (kinds[i.kind] = (kinds[i.kind] || 0) + 1));
    setBatch({ id: batchId, chunks, ids, kinds });
    setShown(true);
    setCopied(false);
  };

  const done = async () => {
    if (!batch) return;
    // элементы остаются в базе и при появлении сети всё равно уйдут через /sync — сервер отбросит их как дубли
    await db.outbox.where('id').anyOf(batch.ids).modify((i) => {
      if (i.status === 'pending') i.status = 'sent_qr';
    });
    setMsg(t('Готово! Результаты у мастера. Когда появится интернет, телефон ещё раз всё проверит.'));
    setBatch(null);
  };

  const onAck = async (text: string) => {
    const dev = await getDevice(user!.id);
    if (!dev || !text.startsWith('DPACK1|')) return;
    const ack = await verifyAck(text, dev.secretB64);
    if (!ack) {
      setErr(t('Этот код не подходит. Попросите мастера показать код ещё раз.'));
      return;
    }
    const n = await applyAck(ack);
    setScanAck(false);
    setBatch(null);
    setErr('');
    setMsg(t('Мастер принял результаты: {{n}}. Всё отправлено.', { n: n || ack.accepted }));
  };

  const count = (items || []).length;
  return (
    <div className="max-w-2xl">
      <PageTitle sub={t('Если в цеху нет интернета, покажите коды мастеру — его компьютер всё отправит.')}>{t('Передать результаты мастеру')}</PageTitle>
      {msg && <div className="mb-3"><Alert kind="success">{msg}</Alert></div>}
      {err && <div className="mb-3"><Alert kind="error">{err}</Alert></div>}

      {!batch && !scanAck && (
        <Card className="p-5 space-y-3">
          <div className="text-lg">{t('Ждут отправки')}: <b>{count}</b></div>
          {waiting > 0 && <div className="text-slate-600">{t('Уже переданы мастеру, ждём подтверждения')}: {waiting}</div>}
          <Button big icon="qr" className="w-full" disabled={!count} onClick={() => void build()}>
            {count ? t('Показать коды мастеру') : t('Всё уже отправлено')}
          </Button>
          {shown && (
            <button className="w-full min-h-tap text-brand-700 font-medium flex items-center justify-center gap-2" onClick={() => setScanAck(true)}>
              <Icon name="camera" size={18} />{t('Сканировать подтверждение мастера')}
            </button>
          )}
        </Card>
      )}

      {batch && (
        <div className="space-y-4">
          <Alert kind="info"><b>{t('Покажите этот экран камере компьютера мастера')}</b></Alert>
          <QrCarousel chunks={batch.chunks} />
          <div className="text-center text-slate-600">
            {t('Передаём записей')}: <b>{batch.ids.length}</b>{batch.kinds.attempt ? ` · ${t('тестов')}: ${batch.kinds.attempt}` : ''}
          </div>
          <Button big variant="success" icon="check" className="w-full" onClick={() => void done()}>{t('Готово, мастер принял')}</Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" icon="copy" onClick={() => void copyText(batch.chunks.join('\n')).then(setCopied)}>
              {copied ? t('Скопировано') : t('Скопировать код')}
            </Button>
            <Button variant="secondary" icon="camera" onClick={() => setScanAck(true)}>{t('Сканировать подтверждение')}</Button>
          </div>
        </div>
      )}

      {scanAck && (
        <div className="space-y-3 mt-4">
          <Alert kind="info">{t('Наведите камеру телефона на код на экране мастера')}</Alert>
          <QrScanner onResult={(txt) => void onAck(txt)} autoStart preferBack />
          <Button variant="secondary" onClick={() => setScanAck(false)}>{t('Отмена')}</Button>
        </div>
      )}
    </div>
  );
}

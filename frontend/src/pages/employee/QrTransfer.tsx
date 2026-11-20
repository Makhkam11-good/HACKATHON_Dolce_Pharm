import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth';
import { QrCarousel } from '../../components/QrCarousel';
import { QrScanner } from '../../components/QrScanner';
import { Alert, Button, Card, PageTitle } from '../../components/ui';
import { db, setMeta } from '../../offline/db';
import { getDevice } from '../../offline/device';
import { applyAck, verifyAck } from '../../offline/qrAck';
import { buildPacket } from '../../offline/qrExport';

export default function QrTransfer() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const items = useLiveQuery(() => (user ? db.outbox.where('[userId+status]').equals([user.id, 'pending']).toArray() : []), [user?.id], []);
  const waiting = useLiveQuery(() => (user ? db.outbox.where('[userId+status]').equals([user.id, 'sent_qr']).count() : 0), [user?.id], 0);
  const [batch, setBatch] = useState<{ id: string; chunks: string[]; ids: string[]; kinds: Record<string, number> } | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [scanAck, setScanAck] = useState(false);

  const build = async () => {
    setErr('');
    setMsg('');
    const dev = await getDevice(user!.id);
    if (!dev) {
      setErr(t('Устройство не зарегистрировано: войдите хотя бы раз при наличии сети.'));
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
  };

  const done = async () => {
    if (!batch) return;
    // элементы остаются в базе и при появлении сети всё равно уйдут через /sync — сервер отбросит их как дубли
    await db.outbox.where('id').anyOf(batch.ids).modify((i) => {
      if (i.status === 'pending') i.status = 'sent_qr';
    });
    setMsg(t('Отмечено как переданное мастеру. При появлении сети данные будут перепроверены сервером.'));
    setBatch(null);
  };

  const onAck = async (text: string) => {
    const dev = await getDevice(user!.id);
    if (!dev || !text.startsWith('DPACK1|')) return;
    const ack = await verifyAck(text, dev.secretB64);
    if (!ack) {
      setErr(t('Подтверждение не прошло проверку подписи'));
      return;
    }
    const n = await applyAck(ack);
    setScanAck(false);
    setBatch(null);
    setErr('');
    setMsg(t('Сервер подтвердил приём: {{n}} записей.', { n: n || ack.accepted }));
  };

  const count = (items || []).length;
  return (
    <div className="max-w-2xl">
      <PageTitle sub={t('Если в цеху нет сети: покажите коды мастеру — его ноутбук передаст данные на сервер.')}>{t('Передать мастеру без сети')}</PageTitle>
      {msg && <div className="mb-3"><Alert kind="success">{msg}</Alert></div>}
      {err && <div className="mb-3"><Alert kind="error">{err}</Alert></div>}
      {!batch && !scanAck && (
        <Card className="p-5 space-y-3">
          <div className="text-lg">{t('Не отправлено записей')}: <b>{count}</b></div>
          {waiting > 0 && <div className="text-sm text-slate-500">{t('Передано через QR и ждут подтверждения сети')}: {waiting}</div>}
          <Button big icon="qr" disabled={!count} onClick={() => void build()}>{t('Показать QR-коды')}</Button>
          <Button big variant="secondary" icon="camera" onClick={() => setScanAck(true)}>{t('Сканировать подтверждение мастера')}</Button>
        </Card>
      )}
      {batch && (
        <div className="space-y-4">
          <div className="text-center text-slate-600">
            {t('Пакет')} <b className="font-mono">{batch.id}</b>: {t('событий')} {batch.kinds.event || 0}, {t('попыток теста')} {batch.kinds.attempt || 0}
            {batch.kinds.assessment_response ? `, ${t('оценок 360')} ${batch.kinds.assessment_response}` : ''}
          </div>
          <QrCarousel chunks={batch.chunks} />
          <div className="grid sm:grid-cols-2 gap-2">
            <Button big variant="success" icon="check" onClick={() => void done()}>{t('Готово, мастер принял')}</Button>
            <Button big variant="secondary" icon="camera" onClick={() => setScanAck(true)}>{t('Сканировать подтверждение')}</Button>
          </div>
        </div>
      )}
      {scanAck && (
        <div className="space-y-3 mt-4">
          <Alert kind="info">{t('Наведите камеру на QR-подтверждение на экране мастера')}</Alert>
          <QrScanner onResult={(txt) => void onAck(txt)} />
          <Button variant="secondary" onClick={() => setScanAck(false)}>{t('Отмена')}</Button>
        </div>
      )}
    </div>
  );
}

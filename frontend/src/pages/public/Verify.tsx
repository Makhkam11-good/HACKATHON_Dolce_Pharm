import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { Icon } from '../../components/Icon';
import { DEMO_NOTE } from '../../components/Layout';
import { Spinner } from '../../components/ui';

interface V { valid: boolean; full_name?: string; position?: string; course?: string; issued_at_local?: string; number?: string }

export default function Verify() {
  const { code } = useParams();
  const { t } = useTranslation();
  const [v, setV] = useState<V | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    api<V>(`/api/certificates/verify/${encodeURIComponent(code || '')}`).then(setV).catch(() => setErr(true));
  }, [code]);
  return (
    <div className="min-h-[100dvh] bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow border max-w-md w-full p-6 text-center">
        <img src="/brand/logo.png" className="h-14 w-auto mx-auto mb-3" alt="Dolce Pharm" />
        <div className="font-bold text-brand-700 mb-4">{t('Проверка сертификата')}</div>
        {err ? <div className="text-slate-700">{t('Нет интернета. Ничего страшного — всё сохранено, попробуйте позже.')}</div> : !v ? <Spinner /> : v.valid ? (
          <>
            <Icon name="shield" size={56} className="mx-auto text-emerald-600 mb-2" />
            <div className="text-2xl font-black text-emerald-700 mb-3">{t('Сертификат действителен')}</div>
            <div className="text-left space-y-1">
              <div><span className="text-slate-600">{t('Номер')}:</span> <b>{v.number}</b></div>
              <div><span className="text-slate-600">{t('ФИО')}:</span> <b>{v.full_name}</b></div>
              {v.position && <div><span className="text-slate-600">{t('Должность')}:</span> {v.position}</div>}
              <div><span className="text-slate-600">{t('Курс')}:</span> {v.course}</div>
              <div><span className="text-slate-600">{t('Выдан')}:</span> {v.issued_at_local}</div>
            </div>
          </>
        ) : (
          <>
            <Icon name="xCircle" size={56} className="mx-auto text-red-600 mb-2" />
            <div className="text-2xl font-black text-red-700">{t('Сертификат не найден')}</div>
            <div className="text-slate-600 mt-2">{t('Код')}: <span className="font-mono">{code}</span></div>
          </>
        )}
      </div>
      <p className="text-[0.85rem] text-slate-600 mt-4 text-center">{t(DEMO_NOTE)}</p>
    </div>
  );
}

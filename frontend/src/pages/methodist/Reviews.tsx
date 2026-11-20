import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, errorText } from '../../api/client';
import { Alert, Badge, Button, Card, Empty, fmtDate, PageTitle, Spinner } from '../../components/ui';

interface Rev {
  answer_id: string; attempt_id: string; full_name: string; department: string; course_title: string; question: string; points: number;
  answer_text: string; keywords: string[]; keywords_min: number; found_keywords: string[]; finished_at: string;
}

function highlight(text: string, found: string[]) {
  if (!found.length) return text;
  const stems = found.map((k) => k.toLowerCase().replace(/ё/g, 'е').slice(0, Math.max(4, k.length - 2)));
  return text.split(/(\s+)/).map((w, i) => {
    const n = w.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]/gu, '');
    return stems.some((s) => n.startsWith(s)) ? <mark key={i} className="bg-emerald-200 rounded px-0.5">{w}</mark> : w;
  });
}

export default function Reviews() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Rev[] | null>(null);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const load = () => void api<Rev[]>('/api/reviews').then(setRows);
  useEffect(load, []);

  const decide = async (r: Rev, accept: boolean) => {
    try {
      const res = await api<{ score: number; status: string; certificate_number: string | null }>(`/api/reviews/${r.answer_id}`, { body: { accept } });
      const st = res.status === 'passed' ? t('сдал') : res.status === 'failed' ? t('не сдал') : t('ещё на проверке');
      setMsg({ kind: 'success', text: `${r.full_name}: ${t('попытка пересчитана')} — ${res.score}%, ${st}${res.certificate_number ? `, ${t('выдан сертификат')} ${res.certificate_number}` : ''}` });
      load();
    } catch (e) {
      setMsg({ kind: 'error', text: errorText(e) });
    }
  };

  return (
    <div className="max-w-3xl">
      <PageTitle sub={t('Открытые ответы, где найдено недостаточно ключевых слов')}>{t('Проверка открытых ответов')}</PageTitle>
      {msg && <div className="mb-3"><Alert kind={msg.kind}>{msg.text}</Alert></div>}
      {!rows ? <Spinner /> : !rows.length ? <Empty icon="check">{t('Очередь пуста — всё проверено')}</Empty> : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.answer_id} className="p-4">
              <div className="flex flex-wrap justify-between gap-2 text-sm text-slate-500 mb-2">
                <span><b className="text-slate-900">{r.full_name}</b> · {r.department}</span>
                <span>{r.course_title} · {fmtDate(r.finished_at)}</span>
              </div>
              <div className="font-semibold mb-2">{r.question} <span className="text-slate-500 font-normal">({r.points} {t('балл.')})</span></div>
              <div className="bg-slate-50 border rounded-xl p-3 text-lg mb-2">{r.answer_text ? highlight(r.answer_text, r.found_keywords) : <i>{t('пусто')}</i>}</div>
              <div className="flex flex-wrap gap-1 mb-3 text-sm">
                <span className="text-slate-500">{t('Ключевые слова')} ({t('нужно')} {r.keywords_min}):</span>
                {r.keywords.map((k) => <Badge key={k} color={r.found_keywords.includes(k) ? 'green' : 'slate'}>{k}</Badge>)}
              </div>
              <div className="flex gap-2">
                <Button variant="success" icon="check" onClick={() => void decide(r, true)}>{t('Засчитать')}</Button>
                <Button variant="danger" icon="x" onClick={() => void decide(r, false)}>{t('Не засчитать')}</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

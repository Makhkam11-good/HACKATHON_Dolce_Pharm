import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { Icon } from '../../components/Icon';
import { ScenarioPlayer } from '../../components/ScenarioPlayer';
import { Alert, Card, Empty, PageTitle, Spinner, useOnline } from '../../components/ui';
import { db } from '../../offline/db';
import { enqueue } from '../../offline/outbox';
import type { Scenario } from '../../types';

export default function Trainer() {
  const { scenarioId } = useParams();
  const { t } = useTranslation();
  const nav = useNavigate();
  const online = useOnline();
  const list = useLiveQuery(() => db.scenarios.toArray(), [], undefined);

  useEffect(() => {
    if (!online) return;
    void api<Scenario[]>('/api/scenarios').then((ss) => db.scenarios.bulkPut(ss.map((s) => ({ id: s.id, scenario: s })))).catch(() => undefined);
  }, [online]);

  if (list === undefined) return <Spinner />;
  if (scenarioId) {
    const s = list.find((x) => x.id === scenarioId)?.scenario;
    if (!s) return <Alert kind="warn">{t('Тренажёр не сохранён на телефоне. Сохраните курс или откройте, когда есть интернет.')}</Alert>;
    return (
      <div className="max-w-3xl">
        <button className="text-brand-700 font-medium mb-2 min-h-tap flex items-center" onClick={() => nav('/trainer')}><Icon name="left" />{t('Тренажёр')}</button>
        <PageTitle sub={s.description}>{s.title}</PageTitle>
        <ScenarioPlayer scenario={s} onFinish={(r) => void enqueue('scenario_run', {
          id: crypto.randomUUID(), scenario_id: s.id, path: r.path, total_score: r.total, max_score: r.max, finished_at: new Date().toISOString(),
        })} />
      </div>
    );
  }
  return (
    <div className="max-w-2xl">
      <PageTitle sub={t('Ситуации из цеха: выберите, как поступить. Можно без интернета.')}>{t('Тренажёр')}</PageTitle>
      {!list.length && <Empty icon="chat">{t('Нет доступных сценариев')}</Empty>}
      <div className="space-y-2">
        {list.map(({ scenario: s }) => (
          <Card key={s.id} className="p-4 flex items-center gap-3" onClick={() => nav(`/trainer/${s.id}`)}>
            <div className="w-12 h-12 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center"><Icon name="chat" /></div>
            <div className="flex-1"><div className="font-semibold">{s.title}</div><div className="text-slate-600">{s.description}</div></div>
            <Icon name="right" className="text-slate-400" />
          </Card>
        ))}
      </div>
    </div>
  );
}

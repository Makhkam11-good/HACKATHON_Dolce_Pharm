import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Scenario, ScenarioData } from '../types';
import { CharacterAvatar } from './CharacterAvatar';
import { Button } from './ui';

/** Максимум баллов — обход графа по лучшим вариантам (с защитой от циклов). */
export function maxScore(data: ScenarioData): number {
  const memo = new Map<string, number>();
  const visit = (id: string, stack: Set<string>): number => {
    if (memo.has(id)) return memo.get(id)!;
    const n = data.nodes[id];
    if (!n || n.end || !n.choices?.length || stack.has(id)) return 0;
    stack.add(id);
    const best = Math.max(...n.choices.map((c) => (c.score || 0) + visit(c.next, stack)));
    stack.delete(id);
    memo.set(id, best);
    return best;
  };
  return Math.max(0, visit(data.start, new Set()));
}

export interface RunResult { path: string[]; total: number; max: number }

export function ScenarioPlayer({ scenario, onFinish }: { scenario: Scenario; onFinish?: (r: RunResult) => void }) {
  const { t } = useTranslation();
  const data = scenario.data;
  const [nodeId, setNodeId] = useState(data.start);
  const [path, setPath] = useState<string[]>([data.start]);
  const [total, setTotal] = useState(0);
  const [reported, setReported] = useState(false);
  const node = data.nodes[nodeId];
  const max = maxScore(data);
  const bg = node?.background || 'workshop';
  const speaker = node?.speaker ? data.characters?.[node.speaker]?.name || node.speaker : '';

  if (!node) return <div className="text-red-700">{t('Ошибка сценария: узел')} «{nodeId}» {t('не найден')}</div>;

  const choose = (i: number) => {
    const c = node.choices![i];
    const nt = total + (c.score || 0);
    const np = [...path, c.next];
    setTotal(nt);
    setPath(np);
    setNodeId(c.next);
    const next = data.nodes[c.next];
    if (next?.end && !reported) {
      setReported(true);
      onFinish?.({ path: np, total: nt, max });
    }
  };

  const restart = () => {
    setNodeId(data.start);
    setPath([data.start]);
    setTotal(0);
    setReported(false);
  };

  return (
    <div className={`relative rounded-2xl overflow-hidden min-h-[560px] bg-${bg} transition-all duration-500`}>
      {bg === 'alarm' && <div className="absolute inset-0 bg-red-600 alarm-light pointer-events-none" />}
      {bg === 'workshop' && <div className="absolute bottom-[44%] left-6 right-6 h-10 bg-slate-500/40 rounded" aria-hidden />}
      {bg === 'lab' && <div className="absolute top-8 right-8 w-24 h-32 border-4 border-white/70 rounded-lg" aria-hidden />}
      <div className="relative p-4 sm:p-6 flex flex-col min-h-[560px]">
        <div className="flex items-end gap-3 fade-in" key={nodeId}>
          <div className="shrink-0"><CharacterAvatar emotion={node.emotion} size={130} /></div>
          <div className="relative bg-white rounded-2xl rounded-bl-none shadow-lg p-4 mb-10 flex-1">
            {speaker && <div className="text-sm font-bold text-brand-700 mb-1">{speaker}</div>}
            <div className="text-lg leading-snug">{node.text}</div>
          </div>
        </div>
        <div className="mt-auto space-y-2">
          {!node.end && node.choices?.map((c, i) => (
            <button key={i} onClick={() => choose(i)} className="w-full text-left bg-white/95 hover:bg-white border-2 border-white hover:border-brand-400 rounded-xl p-4 min-h-[56px] text-lg font-medium shadow">
              {c.text}
            </button>
          ))}
          {node.end && (
            <div className="bg-white rounded-2xl p-5 shadow-lg fade-in">
              <div className="text-sm text-slate-500">{t('Итог')}</div>
              <div className="text-3xl font-black mb-1">{total} / {max} <span className="text-lg text-slate-500">({max ? Math.round((100 * Math.max(0, total)) / max) : 0}%)</span></div>
              {node.feedback && <div className="text-lg mb-3">{node.feedback}</div>}
              <div className="text-xs text-slate-500 mb-3">{t('Путь')}: {path.join(' → ')}</div>
              <Button big icon="refresh" onClick={restart}>{t('Пройти ещё раз')}</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

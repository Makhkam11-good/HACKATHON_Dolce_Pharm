import { closestCenter, DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { Answer } from '../types';
import { Icon } from './Icon';

export interface RQuestion { id: string; type: 'single' | 'multi' | 'open' | 'order'; body: string; options?: { id: string; text: string }[] }

function SortItem({ id, text, index, total, move }: { id: string; text: string; index: number; total: number; move: (from: number, to: number) => void }) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`bg-white border-2 rounded-2xl p-3 ${isDragging ? 'border-brand-600 shadow-lift z-10 relative' : 'border-slate-300'}`}>
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 shrink-0 rounded-full bg-brand-600 text-white font-bold flex items-center justify-center text-lg">{index + 1}</span>
        <span className="flex-1 text-lg pt-1">{text}</span>
        {/* перетаскивание — дополнительный способ */}
        <button className="touch-none min-h-tap min-w-tap flex items-center justify-center text-slate-500 cursor-grab rounded-xl hover:bg-slate-100" {...attributes} {...listeners} aria-label={t('Перетащить')}>
          <Icon name="grip" />
        </button>
      </div>
      {/* основной способ — кнопки «Выше / Ниже» с подписями */}
      <div className="grid grid-cols-2 gap-3 mt-2">
        <button className="min-h-tap rounded-xl border-2 border-slate-300 flex items-center justify-center gap-1.5 font-semibold text-slate-800 hover:border-brand-600 disabled:opacity-40" disabled={index === 0} onClick={() => move(index, index - 1)}>
          <Icon name="up" size={20} />{t('Выше')}
        </button>
        <button className="min-h-tap rounded-xl border-2 border-slate-300 flex items-center justify-center gap-1.5 font-semibold text-slate-800 hover:border-brand-600 disabled:opacity-40" disabled={index === total - 1} onClick={() => move(index, index + 1)}>
          <Icon name="down" size={20} />{t('Ниже')}
        </button>
      </div>
    </li>
  );
}

export function QuestionRenderer({ q, answer, onChange, disabled }: { q: RQuestion; answer: Answer | undefined; onChange: (a: Answer) => void; disabled?: boolean }) {
  const { t } = useTranslation();
  const opts = q.options || [];
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const order = answer?.order_option_ids?.length === opts.length ? answer.order_option_ids : opts.map((o) => o.id);

  useEffect(() => {
    if (q.type === 'order' && !answer?.order_option_ids) onChange({ order_option_ids: opts.map((o) => o.id) });
  }, [q.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const sel = new Set(answer?.selected_option_ids || []);
  const move = (from: number, to: number) => onChange({ order_option_ids: arrayMove(order, from, to) });
  const onDragEnd = (e: DragEndEvent) => {
    if (e.over && e.active.id !== e.over.id) move(order.indexOf(String(e.active.id)), order.indexOf(String(e.over.id)));
  };

  return (
    <div data-qtype={q.type}>
      <h2 className="text-xl font-bold mb-2 leading-snug">{q.body}</h2>
      <div className="text-lg font-semibold text-accent-700 mb-4 flex items-center gap-2">
        <Icon name="info" size={20} />
        {q.type === 'single' && t('Выберите один ответ')}
        {q.type === 'multi' && t('Можно выбрать несколько')}
        {q.type === 'order' && t('Расставьте по порядку: кнопки «Выше» и «Ниже»')}
        {q.type === 'open' && t('Напишите ответ своими словами')}
      </div>
      {(q.type === 'single' || q.type === 'multi') && (
        <div className="space-y-3">
          {opts.map((o) => {
            const on = sel.has(o.id);
            return (
              <button key={o.id} disabled={disabled}
                onClick={() => {
                  if (q.type === 'single') onChange({ selected_option_ids: [o.id] });
                  else {
                    const s = new Set(sel);
                    if (on) s.delete(o.id);
                    else s.add(o.id);
                    onChange({ selected_option_ids: [...s] });
                  }
                }}
                className={`w-full text-left flex items-center gap-3 rounded-2xl border-2 p-4 min-h-[64px] text-lg transition-colors ${on ? 'border-brand-600 bg-brand-50 text-slate-900 font-semibold' : 'border-slate-300 bg-white hover:border-brand-400'}`}
                role={q.type === 'single' ? 'radio' : 'checkbox'} aria-checked={on}>
                <span className={`w-8 h-8 shrink-0 border-2 flex items-center justify-center ${q.type === 'single' ? 'rounded-full' : 'rounded-lg'} ${on ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-400 bg-white'}`}>
                  {on && <Icon name="check" size={20} strokeWidth={3} />}
                </span>
                <span>{o.text}</span>
              </button>
            );
          })}
        </div>
      )}
      {q.type === 'open' && (
        <textarea disabled={disabled} className="w-full rounded-2xl border-2 border-slate-300 p-4 text-lg min-h-[200px] focus:border-brand-600 focus:outline-none" aria-label={t('Ваш ответ')}
          value={answer?.answer_text || ''} onChange={(e) => onChange({ answer_text: e.target.value })} placeholder={t('Ваш ответ…')} />
      )}
      {q.type === 'order' && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            <ol className="space-y-3">
              {order.map((id, i) => (
                <SortItem key={id} id={id} index={i} total={order.length} text={opts.find((o) => o.id === id)?.text || ''} move={move} />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

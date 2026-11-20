import { closestCenter, DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { Answer } from '../types';
import { Icon } from './Icon';

export interface RQuestion { id: string; type: 'single' | 'multi' | 'open' | 'order'; body: string; options?: { id: string; text: string }[] }

function SortItem({ id, text, index, total, move }: { id: string; text: string; index: number; total: number; move: (from: number, to: number) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 bg-white border-2 rounded-xl p-2 ${isDragging ? 'border-brand-500 shadow-lg z-10 relative' : 'border-slate-200'}`}>
      <button className="touch-none min-h-tap min-w-tap flex items-center justify-center text-slate-400 cursor-grab" {...attributes} {...listeners} aria-label="Перетащить">
        <Icon name="grip" />
      </button>
      <span className="w-7 h-7 shrink-0 rounded-full bg-brand-100 text-brand-800 font-bold flex items-center justify-center">{index + 1}</span>
      <span className="flex-1 text-lg">{text}</span>
      <div className="flex flex-col">
        <button className="min-w-tap h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 disabled:opacity-30" disabled={index === 0} onClick={() => move(index, index - 1)} aria-label="Выше"><Icon name="up" /></button>
        <button className="min-w-tap h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 disabled:opacity-30" disabled={index === total - 1} onClick={() => move(index, index + 1)} aria-label="Ниже"><Icon name="down" /></button>
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
    <div>
      <div className="text-xl font-semibold mb-2 leading-snug">{q.body}</div>
      <div className="text-sm text-slate-500 mb-4">
        {q.type === 'single' && t('Выберите один ответ')}
        {q.type === 'multi' && t('Выберите все верные')}
        {q.type === 'order' && t('Расставьте в правильном порядке: перетащите или используйте стрелки')}
        {q.type === 'open' && t('Напишите ответ своими словами')}
      </div>
      {(q.type === 'single' || q.type === 'multi') && (
        <div className="space-y-2">
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
                className={`w-full text-left flex items-center gap-3 rounded-xl border-2 p-3 min-h-[56px] text-lg transition-colors ${on ? 'border-brand-600 bg-brand-50' : 'border-slate-200 bg-white hover:border-brand-300'}`}
                role={q.type === 'single' ? 'radio' : 'checkbox'} aria-checked={on}>
                <span className={`w-7 h-7 shrink-0 border-2 flex items-center justify-center ${q.type === 'single' ? 'rounded-full' : 'rounded-md'} ${on ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300'}`}>
                  {on && (q.type === 'single' ? <span className="w-3 h-3 rounded-full bg-white" /> : <Icon name="check" size={18} />)}
                </span>
                <span>{o.text}</span>
              </button>
            );
          })}
        </div>
      )}
      {q.type === 'open' && (
        <textarea disabled={disabled} className="w-full rounded-xl border-2 border-slate-200 p-3 text-lg min-h-[160px] focus:border-brand-500 focus:outline-none"
          value={answer?.answer_text || ''} onChange={(e) => onChange({ answer_text: e.target.value })} placeholder={t('Ваш ответ…')} />
      )}
      {q.type === 'order' && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            <ol className="space-y-2">
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

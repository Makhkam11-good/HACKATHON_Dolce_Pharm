import { closestCenter, DndContext, type DragEndEvent, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorText } from '../../api/client';
import i18n from '../../i18n';
import { Icon } from '../../components/Icon';
import { MarkdownBlock } from '../../components/MarkdownBlock';
import { Alert, Badge, Button, Card, Field, fmtBytes, inputCls, Modal, PageTitle, Spinner } from '../../components/ui';
import { authToken } from '../../offline/session';
import type { Category, Competency, FileInfo } from '../../types';
import { MAT_ICON } from '../employee/CourseView';

interface Material { id: string; position: number; type: string; title: string; file: FileInfo | null; url: string | null; body_md: string | null; min_seconds: number }
interface Course { id: string; title: string; description: string; category_id: string | null; status: string; version: number; pass_score: number; cover_color: string; materials: Material[]; competency_ids: string[] }

const TYPE_LABEL: Record<string, string> = { pdf: 'PDF', video: 'Видео', doc: 'Документ Word', xls: 'Таблица Excel', ppt: 'Презентация', link: 'Ссылка', text: 'Текст' };
const ACCEPT = '.pdf,.mp4,.mov,.webm,.doc,.docx,.xls,.xlsx,.ppt,.pptx';

/** Cloudflare Tunnel пропускает запросы до ~100 МБ; с запасом предупреждаем начиная с 95 МБ. */
const TUNNEL_UPLOAD_LIMIT = 95 * 1024 * 1024;

/** Открыто ли приложение напрямую (localhost или адрес в локальной сети), а не через публичный туннель. */
function isServerLocal(): boolean {
  const h = window.location.hostname;
  return h === 'localhost' || h === '::1' || h === '[::1]' || h.endsWith('.local') ||
    /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h);
}

/** Подсказка методисту: большой файл через туннель не пройдёт — загрузить с компьютера сервера. */
export function LargeUploadHint({ file }: { file: File | null }) {
  const { t } = useTranslation();
  if (!file || file.size <= TUNNEL_UPLOAD_LIMIT || isServerLocal()) return null;
  return (
    <div className="mb-3">
      <Alert kind="warn">
        {t('Файл больше 95 МБ. Через публичный адрес можно загрузить не больше ~100 МБ — загрузка может не пройти. Откройте кабинет на компьютере сервера по адресу https://localhost и загрузите файл оттуда.')}
      </Alert>
    </div>
  );
}

/** Загрузка с прогрессом (XHR), т.к. fetch не даёт прогресс отправки. */
export function uploadFile(file: File, onProgress: (p: number) => void): Promise<FileInfo & { kind: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/files');
    xhr.setRequestHeader('Authorization', `Bearer ${authToken()}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress((100 * e.loaded) / e.total);
    xhr.onload = () => {
      // 413 от Cloudflare приходит HTML-страницей — объясняем по-человечески
      if (xhr.status === 413 && !isServerLocal()) {
        reject(new Error(i18n.t('Файл слишком большой для загрузки через публичный адрес (лимит ~100 МБ). Загрузите его с компьютера сервера: https://localhost')));
        return;
      }
      try {
        const j = JSON.parse(xhr.responseText);
        if (xhr.status >= 300) reject(new Error(j.detail?.message || `Ошибка ${xhr.status}`));
        else resolve(j);
      } catch {
        reject(new Error(`Ошибка ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error('Нет связи с сервером'));
    const fd = new FormData();
    fd.append('file', file);
    xhr.send(fd);
  });
}

function typeFromName(name: string): string {
  const e = name.toLowerCase().split('.').pop() || '';
  if (['mp4', 'mov', 'webm', 'm4v'].includes(e)) return 'video';
  if (['doc', 'docx', 'odt', 'rtf'].includes(e)) return 'doc';
  if (['xls', 'xlsx', 'ods'].includes(e)) return 'xls';
  if (['ppt', 'pptx', 'odp'].includes(e)) return 'ppt';
  return 'pdf';
}

function Row({ m, onEdit, onDelete, onRetry }: { m: Material; onEdit: () => void; onDelete: () => void; onRetry: () => void }) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: m.id });
  const st = m.file?.conversion_status;
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className="bg-white border rounded-xl p-3 flex items-center gap-3">
      <button className="touch-none min-h-tap min-w-tap flex items-center justify-center text-slate-400 cursor-grab" {...attributes} {...listeners} aria-label={t('Перетащить')}><Icon name="grip" /></button>
      <Icon name={MAT_ICON[m.type]} className="text-brand-700 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="font-semibold truncate">{m.title}</div>
        <div className="text-sm text-slate-500 flex flex-wrap gap-2 items-center">
          <span>{t(TYPE_LABEL[m.type])}</span>
          {m.min_seconds > 0 && <span>· {t('мин.')} {m.min_seconds} {t('с')}</span>}
          {m.file && <span>· {m.file.original_name} ({fmtBytes(m.file.size_bytes)}{m.file.offline_size_bytes && m.file.offline_size_bytes !== m.file.size_bytes ? ` → ${fmtBytes(m.file.offline_size_bytes)}` : ''})</span>}
          {st === 'processing' && <Badge color="amber"><span className="w-3 h-3 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />{t('конвертация…')}</Badge>}
          {st === 'ready' && m.type !== 'pdf' && m.file && <Badge color="green">{m.type === 'video' ? t('сжато до 720p') : t('PDF готов')}</Badge>}
          {st === 'failed' && <Badge color="red">{t('ошибка конвертации')}</Badge>}
        </div>
        {st === 'failed' && <div className="text-xs text-red-700 mt-1">{m.file?.conversion_error} <button className="underline font-semibold" onClick={onRetry}>{t('Повторить')}</button></div>}
      </div>
      <button className="min-h-tap min-w-tap rounded-lg hover:bg-slate-100 flex items-center justify-center" onClick={onEdit} aria-label={t('Изменить')}><Icon name="edit" /></button>
      <button className="min-h-tap min-w-tap rounded-lg hover:bg-red-50 text-red-600 flex items-center justify-center" onClick={onDelete} aria-label={t('Удалить')}><Icon name="trash" /></button>
    </li>
  );
}

export default function CourseEditor() {
  const { courseId } = useParams();
  const { t } = useTranslation();
  const nav = useNavigate();
  const [c, setC] = useState<Course | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [comps, setComps] = useState<Competency[]>([]);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [adding, setAdding] = useState<null | 'file' | 'link' | 'text'>(null);
  const [editing, setEditing] = useState<Material | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }));

  const load = () => void api<Course>(`/api/courses/${courseId}`).then(setC);
  useEffect(() => {
    load();
    void api<Category[]>('/api/categories?kind=course').then(setCats);
    void api<Competency[]>('/api/competencies').then(setComps);
  }, [courseId]); // eslint-disable-line react-hooks/exhaustive-deps

  // опрос статуса конвертации
  const processing = c?.materials.some((m) => m.file?.conversion_status === 'processing');
  useEffect(() => {
    if (!processing) return;
    const iv = setInterval(load, 2000);
    return () => clearInterval(iv);
  }, [processing]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!c) return <Spinner />;

  const save = async (patch: Partial<Course>) => {
    try {
      setC(await api<Course>(`/api/courses/${c.id}`, { method: 'PATCH', body: patch }));
      setMsg({ kind: 'success', text: t('Сохранено') });
    } catch (e) {
      setMsg({ kind: 'error', text: errorText(e) });
    }
  };
  const action = async (path: string, okText: string) => {
    try {
      setC(await api<Course>(`/api/courses/${c.id}/${path}`, { method: 'POST' }));
      setMsg({ kind: 'success', text: okText });
    } catch (e) {
      setMsg({ kind: 'error', text: errorText(e) });
    }
  };
  const onDragEnd = async (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const ids = c.materials.map((m) => m.id);
    const next = arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)));
    setC({ ...c, materials: next.map((id) => c.materials.find((m) => m.id === id)!) });
    await api(`/api/courses/${c.id}/materials/reorder`, { body: { ids: next } });
  };

  return (
    <div className="max-w-4xl">
      <Link to="/m/courses" className="text-brand-700 font-medium min-h-tap inline-flex items-center"><Icon name="left" />{t('Курсы')}</Link>
      <PageTitle
        sub={<span className="flex gap-2 items-center"><Badge color={c.status === 'published' ? 'green' : 'slate'}>{c.status === 'published' ? t('Опубликован') : t('Черновик')}</Badge> v{c.version}</span>}
        actions={<>
          <Button variant="secondary" icon="tasks" onClick={() => nav(`/m/courses/${c.id}/test`)}>{t('Тест')}</Button>
          <Button variant="secondary" icon="users" onClick={() => nav(`/m/assignments?course=${c.id}`)}>{t('Назначить')}</Button>
          {c.status === 'published' && <Button variant="ghost" onClick={() => void action('unpublish', t('Снято с публикации'))}>{t('Снять с публикации')}</Button>}
          <Button icon="upload" onClick={() => void action('publish', t('Опубликовано. Сотрудники получат обновление при синхронизации.'))}>
            {c.status === 'published' ? t('Опубликовать новую версию') : t('Опубликовать')}
          </Button>
        </>}
      >{c.title}</PageTitle>
      {msg && <div className="mb-3"><Alert kind={msg.kind}>{msg.text}</Alert></div>}

      <Card className="p-4 mb-4">
        <div className="grid sm:grid-cols-2 gap-x-4">
          <Field label={t('Название')}><input className={inputCls} defaultValue={c.title} onBlur={(e) => e.target.value !== c.title && void save({ title: e.target.value })} /></Field>
          <Field label={t('Категория')}>
            <select className={inputCls} value={c.category_id || ''} onChange={(e) => void save({ category_id: e.target.value || null })}>
              <option value="">—</option>
              {cats.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label={t('Описание')}><textarea className={inputCls} rows={2} defaultValue={c.description} onBlur={(e) => e.target.value !== c.description && void save({ description: e.target.value })} /></Field>
        <div className="grid sm:grid-cols-2 gap-x-4">
          <Field label={t('Проходной балл, %')}><input type="number" min={0} max={100} className={inputCls} defaultValue={c.pass_score} onBlur={(e) => Number(e.target.value) !== c.pass_score && void save({ pass_score: Number(e.target.value) })} /></Field>
          <Field label={t('Цвет обложки')}><input type="color" className="h-12 w-24 rounded-xl border" defaultValue={c.cover_color} onBlur={(e) => void save({ cover_color: e.target.value })} /></Field>
        </div>
        <Field label={t('Компетенции (для рекомендаций по оценке 360)')}>
          <div className="flex flex-wrap gap-2">
            {comps.map((x) => {
              const on = c.competency_ids.includes(x.id);
              return (
                <button key={x.id} onClick={() => void save({ competency_ids: on ? c.competency_ids.filter((i) => i !== x.id) : [...c.competency_ids, x.id] })}
                  className={`rounded-full px-3 min-h-[40px] border-2 text-sm font-medium ${on ? 'bg-brand-600 border-brand-600 text-white' : 'border-slate-200'}`}>
                  {on && '✓ '}{x.name}
                </button>
              );
            })}
          </div>
        </Field>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h2 className="text-lg font-bold">{t('Материалы')}</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon="upload" onClick={() => setAdding('file')}>{t('Файл')}</Button>
          <Button variant="secondary" icon="link" onClick={() => setAdding('link')}>{t('Ссылка')}</Button>
          <Button variant="secondary" icon="text" onClick={() => setAdding('text')}>{t('Текст')}</Button>
        </div>
      </div>
      {!c.materials.length && <Alert kind="info">{t('Добавьте материалы: PDF, видео, документы Word/Excel/PowerPoint (автоматически станут PDF), ссылки или текст.')}</Alert>}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void onDragEnd(e)}>
        <SortableContext items={c.materials.map((m) => m.id)} strategy={verticalListSortingStrategy}>
          <ol className="space-y-2">
            {c.materials.map((m) => (
              <Row key={m.id} m={m} onEdit={() => setEditing(m)}
                onDelete={() => window.confirm(t('Удалить материал?')) && void api(`/api/materials/${m.id}`, { method: 'DELETE' }).then(load)}
                onRetry={() => void api(`/api/files/${m.file!.id}/retry`, { method: 'POST' }).then(load)} />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      <div className="mt-6 flex justify-end">
        <Button variant="danger" icon="trash" onClick={() => window.confirm(t('Удалить курс целиком?')) && void api(`/api/courses/${c.id}`, { method: 'DELETE' }).then(() => nav('/m/courses'))}>{t('Удалить курс')}</Button>
      </div>
      {adding && <AddMaterial kind={adding} courseId={c.id} onClose={() => setAdding(null)} onDone={() => { setAdding(null); load(); }} />}
      {editing && <EditMaterial m={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function AddMaterial({ kind, courseId, onClose, onDone }: { kind: 'file' | 'link' | 'text'; courseId: string; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('https://');
  const [body, setBody] = useState('# Заголовок\n\nТекст **важное**.\n\n- пункт 1\n- пункт 2');
  const [minSec, setMinSec] = useState(kind === 'link' ? 0 : 30);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const [preview, setPreview] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const submit = async () => {
    setErr('');
    try {
      if (kind === 'file') {
        if (!file) return;
        if (file.size > 300 * 1024 * 1024) throw new Error(t('Файл больше 300 МБ'));
        setProgress(0);
        const f = await uploadFile(file, setProgress);
        await api(`/api/courses/${courseId}/materials`, { body: { type: typeFromName(file.name), title: title || file.name.replace(/\.[^.]+$/, ''), file_id: f.id, min_seconds: minSec } });
      } else if (kind === 'link') {
        await api(`/api/courses/${courseId}/materials`, { body: { type: 'link', title: title || url, url, min_seconds: 0 } });
      } else {
        await api(`/api/courses/${courseId}/materials`, { body: { type: 'text', title: title || t('Текстовый блок'), body_md: body, min_seconds: minSec } });
      }
      onDone();
    } catch (e) {
      setErr(errorText(e));
      setProgress(null);
    }
  };

  return (
    <Modal open onClose={onClose} title={kind === 'file' ? t('Загрузить файл') : kind === 'link' ? t('Добавить ссылку') : t('Текстовый блок')} wide={kind === 'text'}>
      {kind === 'file' && (
        <div className="mb-3">
          <input ref={input} type="file" accept={ACCEPT} className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <button className="w-full border-2 border-dashed border-brand-300 rounded-2xl p-6 text-center hover:bg-brand-50" onClick={() => input.current?.click()}>
            <Icon name="upload" size={32} className="mx-auto text-brand-600 mb-2" />
            {file ? <b>{file.name} ({fmtBytes(file.size)})</b> : t('Выберите файл: PDF, MP4/MOV/WEBM, DOC/DOCX, XLS/XLSX, PPT/PPTX (до 300 МБ)')}
          </button>
          <div className="text-xs text-slate-500 mt-2">{t('Office-файлы автоматически конвертируются в PDF, видео — сжимается до 720p.')}</div>
        </div>
      )}
      {kind === 'file' && <LargeUploadHint file={file} />}
      <Field label={t('Название')}><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === 'file' ? file?.name : ''} /></Field>
      {kind === 'link' && <Field label="URL"><input className={inputCls} value={url} onChange={(e) => setUrl(e.target.value)} /></Field>}
      {kind === 'text' && (
        <div className="mb-3">
          <div className="flex gap-2 mb-2">
            <Button variant={preview ? 'ghost' : 'secondary'} onClick={() => setPreview(false)}>{t('Редактор')}</Button>
            <Button variant={preview ? 'secondary' : 'ghost'} onClick={() => setPreview(true)}>{t('Превью')}</Button>
          </div>
          {preview ? <div className="border rounded-xl p-4 min-h-[240px]"><MarkdownBlock text={body} /></div>
            : <textarea className={`${inputCls} font-mono`} rows={12} value={body} onChange={(e) => setBody(e.target.value)} />}
          <div className="text-xs text-slate-500 mt-1">{t('Markdown: # заголовок, **жирный**, *курсив*, - список, 1. нумерация, > цитата')}</div>
        </div>
      )}
      {kind !== 'link' && <Field label={t('Минимальное время изучения, секунд (0 — нет требования)')}><input type="number" min={0} className={inputCls} value={minSec} onChange={(e) => setMinSec(Number(e.target.value))} /></Field>}
      {progress != null && <div className="mb-3 text-sm">{t('Загрузка')}: {Math.round(progress)}%<div className="h-2 bg-slate-100 rounded mt-1"><div className="h-2 bg-brand-500 rounded" style={{ width: `${progress}%` }} /></div></div>}
      {err && <div className="mb-3"><Alert kind="error">{err}</Alert></div>}
      <Button big disabled={(kind === 'file' && !file) || progress != null} onClick={() => void submit()}>{t('Добавить')}</Button>
    </Modal>
  );
}

function EditMaterial({ m, onClose, onDone }: { m: Material; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(m.title);
  const [minSec, setMinSec] = useState(m.min_seconds);
  const [body, setBody] = useState(m.body_md || '');
  const [url, setUrl] = useState(m.url || '');
  const [err, setErr] = useState('');
  const submit = async () => {
    try {
      await api(`/api/materials/${m.id}`, { method: 'PATCH', body: { title, min_seconds: minSec, ...(m.type === 'text' ? { body_md: body } : {}), ...(m.type === 'link' ? { url } : {}) } });
      onDone();
    } catch (e) {
      setErr(errorText(e));
    }
  };
  return (
    <Modal open onClose={onClose} title={t('Материал')} wide={m.type === 'text'}>
      <Field label={t('Название')}><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      {m.type === 'text' && <Field label="Markdown"><textarea className={`${inputCls} font-mono`} rows={10} value={body} onChange={(e) => setBody(e.target.value)} /></Field>}
      {m.type === 'link' && <Field label="URL"><input className={inputCls} value={url} onChange={(e) => setUrl(e.target.value)} /></Field>}
      {m.type !== 'link' && <Field label={t('Минимальное время, секунд')}><input type="number" min={0} className={inputCls} value={minSec} onChange={(e) => setMinSec(Number(e.target.value))} /></Field>}
      {err && <div className="mb-3"><Alert kind="error">{err}</Alert></div>}
      <Button big onClick={() => void submit()}>{t('Сохранить')}</Button>
    </Modal>
  );
}

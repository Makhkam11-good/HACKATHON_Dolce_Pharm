import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, errorText } from '../../api/client';
import { Alert, Badge, Button, Card, Empty, Field, inputCls, Modal, PageTitle, Spinner } from '../../components/ui';
import type { Category, LibraryItem } from '../../types';
import { LargeUploadHint, uploadFile } from './CourseEditor';

export default function MLibrary() {
  const { t } = useTranslation();
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [edit, setEdit] = useState<Partial<LibraryItem> | null>(null);
  const [newCat, setNewCat] = useState({ name: '', parent_id: '' });
  const [err, setErr] = useState('');
  const load = () => {
    void api<LibraryItem[]>('/api/library').then(setItems);
    void api<Category[]>('/api/categories?kind=library').then(setCats);
  };
  useEffect(load, []);

  const addCat = async () => {
    setErr('');
    try {
      await api('/api/categories', { body: { name: newCat.name, kind: 'library', parent_id: newCat.parent_id || null } });
      setNewCat({ name: '', parent_id: '' });
      load();
    } catch (e) {
      setErr(errorText(e));
    }
  };

  return (
    <div>
      <PageTitle actions={<Button icon="plus" onClick={() => setEdit({ title: '', description: '', tags: [], allow_offline: true })}>{t('Документ')}</Button>}>{t('Библиотека')}</PageTitle>
      <Card className="p-4 mb-4">
        <div className="font-semibold mb-2">{t('Категории (2 уровня)')}</div>
        <div className="flex flex-wrap gap-2 mb-3">
          {cats.filter((c) => !c.parent_id).map((c) => (
            <div key={c.id} className="border rounded-xl px-3 py-2">
              <b>{c.name}</b>
              {cats.filter((x) => x.parent_id === c.id).map((x) => <div key={x.id} className="text-sm text-slate-600">— {x.name}</div>)}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <input className={`${inputCls} w-auto flex-1`} placeholder={t('Новая категория')} value={newCat.name} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} />
          <select className={`${inputCls} w-auto`} value={newCat.parent_id} onChange={(e) => setNewCat({ ...newCat, parent_id: e.target.value })}>
            <option value="">{t('Верхний уровень')}</option>
            {cats.filter((c) => !c.parent_id).map((c) => <option key={c.id} value={c.id}>{t('внутри')}: {c.name}</option>)}
          </select>
          <Button variant="secondary" disabled={!newCat.name.trim()} onClick={() => void addCat()}>{t('Добавить')}</Button>
        </div>
        {err && <div className="mt-2"><Alert kind="error">{err}</Alert></div>}
      </Card>
      {!items ? <Spinner /> : !items.length ? <Empty icon="library">{t('Документов пока нет')}</Empty> : (
        <div className="grid sm:grid-cols-2 gap-3">
          {items.map((i) => (
            <Card key={i.id} className="p-4" onClick={() => setEdit(i)}>
              <div className="font-semibold">{i.title}</div>
              <div className="text-sm text-slate-500 mb-2">{i.description}</div>
              <div className="flex flex-wrap gap-1">
                <Badge color="blue">{cats.find((c) => c.id === i.category_id)?.name || t('без категории')}</Badge>
                {i.file && <Badge color={i.file.conversion_status === 'ready' ? 'green' : i.file.conversion_status === 'failed' ? 'red' : 'amber'}>{i.file.original_name}</Badge>}
                {i.tags.map((tg) => <Badge key={tg}>#{tg}</Badge>)}
                {!i.allow_offline && <Badge color="amber">{t('только онлайн')}</Badge>}
              </div>
            </Card>
          ))}
        </div>
      )}
      {edit && <EditItem item={edit} cats={cats} onClose={() => setEdit(null)} onDone={() => { setEdit(null); load(); }} />}
    </div>
  );
}

function EditItem({ item, cats, onClose, onDone }: { item: Partial<LibraryItem>; cats: Category[]; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const [f, setF] = useState({ title: item.title || '', description: item.description || '', category_id: item.category_id || '', tags: (item.tags || []).join(', '), allow_offline: item.allow_offline ?? true, file_id: item.file_id || null });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const submit = async () => {
    setBusy(true);
    setErr('');
    try {
      let fileId = f.file_id;
      if (file) fileId = (await uploadFile(file, () => undefined)).id;
      const body = { title: f.title || file?.name || '', description: f.description, category_id: f.category_id || null, tags: f.tags.split(',').map((s) => s.trim()).filter(Boolean), allow_offline: f.allow_offline, file_id: fileId };
      if (item.id) await api(`/api/library/${item.id}`, { method: 'PATCH', body });
      else await api('/api/library', { body });
      onDone();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={item.id ? t('Документ') : t('Новый документ')}>
      <Field label={t('Название')}><input className={inputCls} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
      <Field label={t('Описание')}><textarea className={inputCls} rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      <Field label={t('Категория')}>
        <select className={inputCls} value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}>
          <option value="">—</option>
          {cats.filter((c) => !c.parent_id).map((c) => (
            <optgroup key={c.id} label={c.name}>
              <option value={c.id}>{c.name}</option>
              {cats.filter((x) => x.parent_id === c.id).map((x) => <option key={x.id} value={x.id}>— {x.name}</option>)}
            </optgroup>
          ))}
        </select>
      </Field>
      <Field label={t('Теги через запятую')}><input className={inputCls} value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} /></Field>
      <label className="flex items-center gap-2 min-h-tap mb-3"><input type="checkbox" className="w-6 h-6" checked={f.allow_offline} onChange={(e) => setF({ ...f, allow_offline: e.target.checked })} />{t('Разрешить сохранять офлайн')}</label>
      <input ref={input} type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.mp4,.mov,.webm" />
      <Button variant="secondary" icon="upload" onClick={() => input.current?.click()} className="mb-3 w-full">{file ? file.name : item.file ? `${t('Заменить файл')} (${item.file.original_name})` : t('Выбрать файл')}</Button>
      <LargeUploadHint file={file} />
      {err && <div className="mb-3"><Alert kind="error">{err}</Alert></div>}
      <div className="flex gap-2">
        <Button big disabled={busy || (!file && !f.file_id)} onClick={() => void submit()}>{busy ? t('Сохранение…') : t('Сохранить')}</Button>
        {item.id && <Button variant="danger" icon="trash" onClick={() => window.confirm(t('Удалить документ?')) && void api(`/api/library/${item.id}`, { method: 'DELETE' }).then(onDone)} />}
      </div>
    </Modal>
  );
}

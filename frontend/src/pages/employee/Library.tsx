import Fuse from 'fuse.js';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, apiBlob, errorText } from '../../api/client';
import { Icon } from '../../components/Icon';
import { PdfViewer } from '../../components/PdfViewer';
import { Alert, Badge, Button, Card, Empty, inputCls, Modal, PageTitle, Spinner, useOnline } from '../../components/ui';
import { VideoPlayer } from '../../components/VideoPlayer';
import { db, getMeta, setMeta } from '../../offline/db';
import type { Category, LibraryItem } from '../../types';

export default function Library() {
  const { t } = useTranslation();
  const online = useOnline();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [open, setOpen] = useState<{ item: LibraryItem; blob: Blob } | null>(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const saved = useLiveQuery(() => db.library.toArray(), [], []);
  const savedFiles = new Set((saved || []).filter((s) => s.savedFile).map((s) => s.id));

  // онлайн — поиск на сервере + обновление локального индекса; офлайн — Fuse.js по индексу
  useEffect(() => {
    void (async () => {
      if (online) {
        try {
          const [list, c] = await Promise.all([api<LibraryItem[]>('/api/library'), api<Category[]>('/api/categories?kind=library')]);
          await setMeta('libraryCats', c);
          setCats(c);
          await db.transaction('rw', db.library, async () => {
            for (const it of list) {
              const prev = await db.library.get(it.id);
              await db.library.put({ id: it.id, item: it, savedFile: prev?.savedFile ?? false });
            }
          });
          setItems(list);
          return;
        } catch {
          /* упали — используем локальный индекс */
        }
      }
      setCats(await getMeta<Category[]>('libraryCats', []));
      setItems((await db.library.toArray()).map((r) => r.item));
    })();
  }, [online]);

  const fuse = useMemo(() => new Fuse(items || [], { keys: ['title', 'description', 'tags'], threshold: 0.38, ignoreLocation: true }), [items]);
  const childIds = (id: string) => [id, ...cats.filter((c) => c.parent_id === id).map((c) => c.id)];
  let shown = q.trim() ? fuse.search(q.trim()).map((r) => r.item) : items || [];
  if (cat) shown = shown.filter((i) => i.category_id && childIds(cat).includes(i.category_id));

  const save = async (it: LibraryItem) => {
    if (!it.file) return;
    setBusy(it.id);
    setErr('');
    try {
      const blob = await apiBlob(`/api/files/${it.file.id}/offline`);
      await db.files.put({ id: it.file.id, blob, mime: it.file.offline_mime || it.file.mime, size: blob.size, sha256: it.file.sha256 || '' });
      await db.library.put({ id: it.id, item: it, savedFile: true });
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy('');
    }
  };

  const view = async (it: LibraryItem) => {
    if (!it.file) return;
    setErr('');
    setBusy(it.id);
    try {
      const f = await db.files.get(it.file.id);
      const blob = f?.blob || (await apiBlob(`/api/files/${it.file.id}/offline`));
      setOpen({ item: it, blob });
    } catch (e) {
      setErr(online ? errorText(e) : t('Документ не сохранён на устройстве'));
    } finally {
      setBusy('');
    }
  };

  return (
    <div>
      <PageTitle sub={online ? undefined : t('Офлайн-поиск по сохранённому индексу')}>{t('Библиотека')}</PageTitle>
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Icon name="search" className="absolute left-3 top-3 text-slate-400" />
          <input className={`${inputCls} pl-10`} placeholder={t('Поиск: огнетушитель, GMP, ожог…')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className={`${inputCls} sm:w-64`} value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">{t('Все категории')}</option>
          {cats.filter((c) => !c.parent_id).map((c) => (
            <optgroup key={c.id} label={c.name}>
              <option value={c.id}>{c.name}</option>
              {cats.filter((x) => x.parent_id === c.id).map((x) => <option key={x.id} value={x.id}>— {x.name}</option>)}
            </optgroup>
          ))}
        </select>
      </div>
      {err && <div className="mb-3"><Alert kind="error">{err}</Alert></div>}
      {items === null ? <Spinner /> : !shown.length ? <Empty icon="library">{t('Ничего не найдено')}</Empty> : (
        <div className="grid gap-3 sm:grid-cols-2">
          {shown.map((it) => (
            <Card key={it.id} className="p-4 flex flex-col gap-2">
              <div className="font-semibold">{it.title}</div>
              <div className="text-sm text-slate-500">{it.description}</div>
              <div className="flex flex-wrap gap-1">
                {cats.find((c) => c.id === it.category_id) && <Badge color="blue">{cats.find((c) => c.id === it.category_id)!.name}</Badge>}
                {it.tags.map((tg) => <Badge key={tg}>#{tg}</Badge>)}
              </div>
              <div className="flex flex-wrap gap-2 mt-auto pt-1">
                <Button icon="file" onClick={() => void view(it)} disabled={busy === it.id}>{t('Открыть')}</Button>
                {it.allow_offline && it.file && (savedFiles.has(it.id)
                  ? <Badge color="teal"><Icon name="check" size={14} />{t('Сохранено офлайн')}</Badge>
                  : <Button variant="secondary" icon="download" disabled={!online || busy === it.id} onClick={() => void save(it)}>{t('Сохранить офлайн')}</Button>)}
              </div>
            </Card>
          ))}
        </div>
      )}
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.item.title} wide>
        {open && ((open.item.file?.offline_mime || '').startsWith('video') ? <VideoPlayer blob={open.blob} /> : <PdfViewer blob={open.blob} />)}
      </Modal>
    </div>
  );
}

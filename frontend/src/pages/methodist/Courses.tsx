import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api, errorText } from '../../api/client';
import { Alert, Badge, Button, Card, EmptyState, Field, inputCls, Modal, PageTitle, Spinner } from '../../components/ui';
import type { Category } from '../../types';

export interface CourseRow {
  id: string; title: string; description: string; category_id: string | null; status: 'draft' | 'published'; version: number;
  pass_score: number; cover_color: string; materials_count: number; questions_count: number; assigned_count: number;
}

export default function Courses() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [rows, setRows] = useState<CourseRow[] | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [cat, setCat] = useState('');
  const [status, setStatus] = useState('');
  const [create, setCreate] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', category_id: '' });
  const [err, setErr] = useState('');

  const load = () => {
    const qs = new URLSearchParams();
    if (cat) qs.set('category_id', cat);
    if (status) qs.set('status', status);
    void api<CourseRow[]>(`/api/courses?${qs}`).then(setRows);
  };
  useEffect(load, [cat, status]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => void api<Category[]>('/api/categories?kind=course').then(setCats), []);

  const submit = async () => {
    setErr('');
    try {
      const c = await api<CourseRow>('/api/courses', { body: { ...form, category_id: form.category_id || null } });
      nav(`/m/courses/${c.id}`);
    } catch (e) {
      setErr(errorText(e));
    }
  };

  return (
    <div>
      <PageTitle sub={t('Создайте курс, добавьте материалы и тест, затем назначьте сотрудникам')} actions={<Button icon="plus" onClick={() => setCreate(true)}>{t('Создать курс')}</Button>}>{t('Курсы')}</PageTitle>
      <div className="flex flex-wrap gap-2 mb-4">
        <select className={`${inputCls} w-auto`} value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">{t('Все категории')}</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className={`${inputCls} w-auto`} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t('Любой статус')}</option>
          <option value="published">{t('Опубликован')}</option>
          <option value="draft">{t('Черновик')}</option>
        </select>
      </div>
      {!rows ? <Spinner /> : !rows.length ? <EmptyState icon="book" title={t('Курсов пока нет')} action={<Button icon="plus" onClick={() => setCreate(true)}>{t('Создать курс')}</Button>}>{t('Нажмите «Создать курс», чтобы начать.')}</EmptyState> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((c) => (
            <Card key={c.id} className="overflow-hidden" onClick={() => nav(`/m/courses/${c.id}`)}>
              <div className="h-2" style={{ background: c.cover_color }} />
              <div className="p-4">
                <div className="font-bold text-lg mb-2 leading-snug">{c.title}</div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge color={c.status === 'published' ? 'green' : 'slate'}>{c.status === 'published' ? t('Опубликован') : t('Черновик')}</Badge>
                  <Badge>{t('Версия')} {c.version}</Badge>
                  <Badge color="blue">{t('Материалов')}: {c.materials_count}</Badge>
                  <Badge color="teal">{t('Вопросов')}: {c.questions_count}</Badge>
                  <Badge>{t('Назначено')}: {c.assigned_count}</Badge>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Modal open={create} onClose={() => setCreate(false)} title={t('Создать курс')}>
        <Field label={t('Название')}><input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label={t('Описание')}><textarea className={inputCls} rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <Field label={t('Категория')}>
          <select className={inputCls} value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
            <option value="">—</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        {err && <div className="mb-3"><Alert kind="error">{err}</Alert></div>}
        <Button big disabled={!form.title.trim()} onClick={() => void submit()}>{t('Создать и перейти к материалам')}</Button>
      </Modal>
    </div>
  );
}

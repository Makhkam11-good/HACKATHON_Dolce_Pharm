import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { errorText } from '../../api/client';
import { useAuth } from '../../auth';
import { Icon } from '../../components/Icon';
import { MarkdownBlock } from '../../components/MarkdownBlock';
import { PdfViewer } from '../../components/PdfViewer';
import { Alert, Button, fmtDuration, Spinner, useOnline } from '../../components/ui';
import { VideoPlayer } from '../../components/VideoPlayer';
import { getFileBlob } from '../../offline/downloader';
import { useCourseProgress } from '../../offline/progress';
import { closeMaterial, liveSeconds, openMaterial, subscribeTracker } from '../../offline/timeTracker';
import { useManifest } from './CourseView';

export default function MaterialView() {
  const { courseId, materialId } = useParams();
  const { t } = useTranslation();
  const { user } = useAuth();
  const nav = useNavigate();
  const online = useOnline();
  const m = useManifest(courseId);
  const pkg = m?.pkg;
  const prog = useCourseProgress(user?.id, pkg);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [err, setErr] = useState('');
  const [, tick] = useState(0);
  const idx = pkg ? pkg.materials.findIndex((x) => x.id === materialId) : -1;
  const mat = pkg && idx >= 0 ? pkg.materials[idx] : null;

  useEffect(() => {
    if (!mat || !courseId) return;
    if (mat.type !== 'link') openMaterial(courseId, mat.id);
    return () => closeMaterial();
  }, [mat?.id, courseId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const unsub = subscribeTracker(() => tick((x) => x + 1));
    const iv = setInterval(() => tick((x) => x + 1), 1000);
    return () => {
      unsub();
      clearInterval(iv);
    };
  }, []);

  useEffect(() => {
    setBlob(null);
    setErr('');
    if (!mat?.file) return;
    getFileBlob(mat.file.id, mat.file.url).then(setBlob).catch((e) => setErr(errorText(e)));
  }, [mat?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (m === undefined) return <Spinner />;
  if (!pkg || !mat) return <Alert kind="warn">{t('Материал не найден на устройстве')}</Alert>;

  const saved = prog.byMat.get(mat.id)?.seconds || 0;
  const total = saved + liveSeconds(mat.id);
  const prev = idx > 0 ? pkg.materials[idx - 1] : null;
  const next = idx < pkg.materials.length - 1 ? pkg.materials[idx + 1] : null;

  return (
    <div className="max-w-4xl pb-24">
      <button className="text-brand-700 font-medium mb-2 min-h-tap flex items-center" onClick={() => nav(`/course/${courseId}`)}>
        <Icon name="left" />{pkg.course.title}
      </button>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h1 className="text-xl font-bold">{idx + 1}. {mat.title}</h1>
        {mat.type !== 'link' && (
          <div className={`rounded-full px-3 py-1 text-sm font-semibold ${mat.min_seconds && total < mat.min_seconds ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'}`}>
            <Icon name="clock" size={14} className="inline mr-1" />
            {fmtDuration(total)}{mat.min_seconds ? ` / ${fmtDuration(mat.min_seconds)}` : ''}
          </div>
        )}
      </div>

      {mat.type === 'text' && <div className="bg-white rounded-2xl border p-5"><MarkdownBlock text={mat.body_md || ''} /></div>}
      {mat.type === 'link' && (
        <div className="bg-white rounded-2xl border p-5 space-y-3">
          <Alert kind={online ? 'info' : 'warn'}>{t('Внешняя ссылка — требует сети. Время по ссылке не учитывается.')}</Alert>
          <div className="font-mono break-all text-slate-700">{mat.url}</div>
          <a href={mat.url} target="_blank" rel="noreferrer noopener"><Button icon="link" disabled={!online}>{t('Открыть в браузере')}</Button></a>
        </div>
      )}
      {mat.file && (
        err ? <Alert kind="error">{online ? err : t('Файл не скачан на устройство. Подключитесь к сети.')}</Alert>
          : !blob ? <Spinner label={t('Загрузка материала…')} />
          : mat.type === 'video' ? <VideoPlayer blob={blob} />
          : <PdfViewer blob={blob} />
      )}

      <div className="fixed bottom-[60px] md:bottom-0 inset-x-0 md:left-60 bg-white/95 border-t p-3 flex gap-2 z-20">
        <Button variant="secondary" icon="left" disabled={!prev} onClick={() => prev && nav(`/course/${courseId}/m/${prev.id}`, { replace: true })} className="flex-1">{t('Назад')}</Button>
        {next ? (
          <Button onClick={() => nav(`/course/${courseId}/m/${next.id}`, { replace: true })} className="flex-1">{t('Далее')}<Icon name="right" /></Button>
        ) : (
          <Button onClick={() => nav(`/course/${courseId}`)} className="flex-1">{t('К тесту')}<Icon name="right" /></Button>
        )}
      </div>
    </div>
  );
}

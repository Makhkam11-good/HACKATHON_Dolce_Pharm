import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { errorText } from '../../api/client';
import { useAuth } from '../../auth';
import { Icon } from '../../components/Icon';
import { MarkdownBlock } from '../../components/MarkdownBlock';
import { PdfViewer } from '../../components/PdfViewer';
import { Banner, Button, EmptyState, fmtHuman, ProgressBar, Spinner, useOnline } from '../../components/ui';
import { VideoPlayer } from '../../components/VideoPlayer';
import { getFileBlob } from '../../offline/downloader';
import { useCourseProgress } from '../../offline/progress';
import { closeMaterial, liveSeconds, markMaterialOpened, openMaterial, subscribeTracker } from '../../offline/timeTracker';
import { BackLink, MAT_KIND, useManifest } from './CourseView';

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
  if (!pkg || !mat) {
    return (
      <EmptyState icon="phone" title={t('Материал не найден на телефоне')} action={<Button icon="left" onClick={() => nav(`/course/${courseId}`)}>{t('Вернуться к курсу')}</Button>}>
        {t('Подключитесь к интернету и сохраните курс на телефон ещё раз.')}
      </EmptyState>
    );
  }

  const saved = prog.byMat.get(mat.id)?.seconds || 0;
  const total = saved + liveSeconds(mat.id);
  const prev = idx > 0 ? pkg.materials[idx - 1] : null;
  const next = idx < pkg.materials.length - 1 ? pkg.materials[idx + 1] : null;
  const need = mat.min_seconds || 0;
  const enough = !need || total >= need;

  return (
    <div className="max-w-4xl mx-auto pb-bottom-bar">
      <BackLink to={`/course/${courseId}`}>{pkg.course.title}</BackLink>
      <div className="text-slate-600 font-semibold">{t('Материал {{k}} из {{n}}', { k: idx + 1, n: pkg.materials.length })} · {t(MAT_KIND[mat.type])}</div>
      <h1 className="text-[1.5rem] font-bold mb-3">{mat.title}</h1>
      {mat.type !== 'link' && need > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 mb-4" data-testid="study-time">
          <div className="flex items-center justify-between gap-3 mb-1.5">
            <span className={`font-semibold flex items-center gap-1.5 ${enough ? 'text-emerald-700' : 'text-slate-800'}`}>
              <Icon name={enough ? 'checkCircle' : 'clock'} size={20} />
              {enough ? t('Изучено — можно идти дальше') : t('Изучите не меньше {{t}}', { t: fmtHuman(need) })}
            </span>
            <span className="text-slate-600 font-semibold">{fmtHuman(Math.min(total, need))} / {fmtHuman(need)}</span>
          </div>
          <ProgressBar value={(100 * Math.min(total, need)) / need} label={t('Время изучения')} />
        </div>
      )}

      {mat.type === 'text' && <div className="bg-white rounded-2xl border border-slate-200 p-5"><MarkdownBlock text={mat.body_md || ''} /></div>}
      {mat.type === 'link' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <Banner kind={online ? 'info' : 'offline'}>
            {online ? t('Это ссылка на сайт для справки. Для теста её открывать не обязательно.') : t('Нет интернета — ссылку откроете позже. Для теста она не обязательна.')}
          </Banner>
          <div className="break-all text-slate-700">{mat.url}</div>
          <a href={mat.url} target="_blank" rel="noreferrer noopener" onClick={() => online && courseId && markMaterialOpened(courseId, mat.id)}
            className={`inline-flex w-full sm:w-auto ${online ? '' : 'pointer-events-none'}`} aria-disabled={!online}>
            <Button icon="link" disabled={!online} className="w-full sm:w-auto">{t('Открыть сайт')}</Button>
          </a>
        </div>
      )}
      {mat.file && (
        err ? <Banner kind={online ? 'error' : 'offline'}>{online ? err : t('Этот файл не сохранён на телефоне. Подключитесь к интернету.')}</Banner>
          : !blob ? <Spinner label={t('Открываем материал…')} />
          : mat.type === 'video' ? <VideoPlayer blob={blob} />
          : <PdfViewer blob={blob} />
      )}

      <div className="bottom-bar bg-white/95 border-t border-slate-200 flex gap-3">
        <Button variant="secondary" icon="left" disabled={!prev} onClick={() => prev && nav(`/course/${courseId}/m/${prev.id}`, { replace: true })} className="flex-1 min-h-big">{t('Назад')}</Button>
        {next ? (
          <Button onClick={() => nav(`/course/${courseId}/m/${next.id}`, { replace: true })} className="flex-1 min-h-big">{t('Далее')}<Icon name="right" /></Button>
        ) : (
          // в тест — только когда все материалы изучены (как и на странице курса), иначе — к списку материалов
          <Button onClick={() => nav(pkg.test && prog.allStudied ? `/course/${courseId}/test` : `/course/${courseId}`)} className="flex-1 min-h-big">
            {pkg.test && prog.allStudied ? t('Перейти к тесту') : t('К курсу')}<Icon name="right" />
          </Button>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth';
import { Icon, type IconName } from '../../components/Icon';
import { Banner, Button, Card, EmptyState, fmtHuman, ListItem, ProgressBar, Spinner, StatusBadge, type StatusKind } from '../../components/ui';
import { getManifest } from '../../offline/downloader';
import { courseStatus, nextMaterial, useAttempts, useCourseProgress, useSyncState } from '../../offline/progress';
import type { CoursePackage } from '../../types';

export const MAT_ICON: Record<string, IconName> = { pdf: 'file', doc: 'file', xls: 'file', ppt: 'file', video: 'video', link: 'link', text: 'text' };
export const MAT_KIND: Record<string, string> = { pdf: 'Документ', doc: 'Документ', xls: 'Таблица', ppt: 'Презентация', video: 'Видео', link: 'Ссылка на сайт', text: 'Текст' };

export function useManifest(courseId: string | undefined) {
  const [data, setData] = useState<{ pkg: CoursePackage; offline: boolean } | null | undefined>(undefined);
  useEffect(() => {
    if (courseId) void getManifest(courseId).then(setData);
  }, [courseId]);
  return data;
}

export function BackLink({ to, children }: { to: string; children: React.ReactNode }) {
  const nav = useNavigate();
  return (
    <button className="text-brand-700 font-semibold mb-2 min-h-tap -ml-1 pr-3 flex items-center gap-1 rounded-xl hover:bg-brand-50" onClick={() => nav(to)}>
      <Icon name="left" />{children}
    </button>
  );
}

export default function CourseView() {
  const { courseId } = useParams();
  const { t } = useTranslation();
  const { user } = useAuth();
  const nav = useNavigate();
  const m = useManifest(courseId);
  const pkg = m?.pkg;
  const prog = useCourseProgress(user?.id, pkg);
  const state = useSyncState(user?.id);
  const attempts = useAttempts(user?.id, state);
  if (m === undefined) return <Spinner />;
  if (!pkg) {
    return (
      <div className="max-w-2xl mx-auto">
        <BackLink to="/my">{t('Обучение')}</BackLink>
        <EmptyState icon="phone" title={t('Курс не сохранён на телефоне')} action={<Button icon="left" onClick={() => nav('/my')}>{t('К списку курсов')}</Button>}>
          {t('Подключитесь к интернету и нажмите «Сохранить на телефон» на главной.')}
        </EmptyState>
      </div>
    );
  }

  const mine = attempts.filter((a) => a.courseId === pkg.course.id);
  const status = courseStatus(attempts, pkg.course.id, prog.anyProgress);
  const left = pkg.test ? Math.max(0, pkg.test.max_attempts - mine.length) : 0;
  const passed = status === 'passed';
  const next = nextMaterial(pkg.materials, prog.byMat);
  const kind: StatusKind = status === 'failed' ? (left > 0 ? 'failed' : 'failed_final') : status;

  let main;
  if (passed) {
    main = null; // курс сдан — главной кнопки нет, материалы можно открыть из списка ниже
  } else if (next) {
    main = <Button big icon="play" onClick={() => nav(`/course/${pkg.course.id}/m/${next.material.id}`)}>{prog.anyProgress ? t('Продолжить') : t('Начать')}</Button>;
  } else if (pkg.test && !passed && status !== 'pending_review' && left > 0) {
    main = <Button big icon="tasks" onClick={() => nav(`/course/${pkg.course.id}/test`)}>{status === 'failed' ? t('Пересдать тест') : t('Перейти к тесту')}</Button>;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <BackLink to="/my">{t('Обучение')}</BackLink>
      <h1 className="text-[1.6rem] font-bold mb-2">{pkg.course.title}</h1>
      {pkg.course.description && <p className="text-slate-700 mb-3">{pkg.course.description}</p>}
      <div className="flex flex-wrap gap-2 mb-4">
        <StatusBadge status={kind} />
        {m.offline ? <StatusBadge status="saved" /> : <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[0.9rem] font-semibold bg-slate-100 text-slate-700"><Icon name="globe" size={16} />{t('Открыт через интернет')}</span>}
      </div>

      <Card className="p-4 mb-5">
        <div className="flex justify-between items-baseline mb-2">
          <span className="font-semibold text-slate-800">
            {passed ? t('Курс пройден') : next ? t('Материал {{k}} из {{n}}', { k: next.index, n: next.total }) : t('Все материалы изучены')}
          </span>
          <b className="text-lg">{passed ? 100 : prog.percent}%</b>
        </div>
        <ProgressBar value={passed ? 100 : prog.percent} label={t('Прогресс курса')} />
        {passed && <div className="text-slate-600 mt-2">{t('Материалы можно открыть ещё раз — ниже.')}</div>}
        {main && <div className="mt-4">{main}</div>}
      </Card>

      <h2 className="text-xl font-bold mb-3">{t('Материалы')}</h2>
      <div className="space-y-3 mb-6">
        {pkg.materials.map((mat, i) => {
          const done = prog.studiedIds.has(mat.id);
          const sec = prog.byMat.get(mat.id)?.seconds || 0;
          const rest = Math.max(0, (mat.min_seconds || 0) - sec);
          const sub = mat.type === 'link'
            ? t('Справочно, не обязательно · нужен интернет')
            : done ? `✓ ${t('Изучено')}`
            : rest > 0 ? `${t(MAT_KIND[mat.type])} · ${t('Изучать не меньше {{t}}', { t: fmtHuman(mat.min_seconds) })}`
            : `${t(MAT_KIND[mat.type])} · ${t('Откройте материал')}`;
          return (
            <ListItem key={mat.id} icon={done ? 'check' : MAT_ICON[mat.type]} iconTone={done ? 'ok' : 'brand'}
              title={`${i + 1}. ${mat.title}`} sub={sub} onClick={() => nav(`/course/${pkg.course.id}/m/${mat.id}`)} />
          );
        })}
      </div>

      {pkg.test && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1"><Icon name="tasks" className="text-brand-700" /><span className="font-bold text-lg">{t('Итоговый тест')}</span></div>
          <div className="text-slate-700 mb-3">
            {t('Вопросов')}: {pkg.test.questions.length} · {t('Чтобы сдать, нужно')} {pkg.course.pass_score}% · {t('Осталось попыток')}: {left}
          </div>
          {passed ? <Banner kind="success">{t('Тест сдан. Курс пройден!')}</Banner>
            : status === 'pending_review' ? <Banner kind="warn">{t('Ответ проверяет методист. Результат появится в разделе «Результаты».')}</Banner>
            : left === 0 ? <Banner kind="error">{t('Попытки закончились. Обратитесь к мастеру.')}</Banner>
            : !prog.allStudied ? <Banner kind="info">{t('Тест откроется, когда вы изучите все материалы.')}</Banner>
            : !main || next ? <Button big icon="tasks" onClick={() => nav(`/course/${pkg.course.id}/test`)}>{t('Перейти к тесту')}</Button> : null}
        </Card>
      )}

      {pkg.scenario && (
        <div className="mt-4">
          <ListItem icon="chat" title={`${t('Тренажёр')}: ${pkg.scenario.title}`} sub={pkg.scenario.description} onClick={() => nav(`/trainer/${pkg.scenario!.id}`)} />
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth';
import { Icon, type IconName } from '../../components/Icon';
import { Alert, Badge, Button, Card, fmtDuration, PageTitle, ProgressBar, Spinner } from '../../components/ui';
import { getManifest } from '../../offline/downloader';
import { courseStatus, STATUS_COLOR, STATUS_LABEL, useAttempts, useCourseProgress, useSyncState } from '../../offline/progress';
import type { CoursePackage } from '../../types';

export const MAT_ICON: Record<string, IconName> = { pdf: 'file', doc: 'file', xls: 'file', ppt: 'file', video: 'video', link: 'link', text: 'text' };

export function useManifest(courseId: string | undefined) {
  const [data, setData] = useState<{ pkg: CoursePackage; offline: boolean } | null | undefined>(undefined);
  useEffect(() => {
    if (courseId) void getManifest(courseId).then(setData);
  }, [courseId]);
  return data;
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
  if (!pkg) return <Alert kind="warn">{t('Курс не скачан на устройство. Подключитесь к сети и нажмите «Скачать офлайн».')}</Alert>;

  const mine = attempts.filter((a) => a.courseId === pkg.course.id);
  const status = courseStatus(attempts, pkg.course.id, prog.anyProgress);
  const left = pkg.test ? Math.max(0, pkg.test.max_attempts - mine.length) : 0;
  const passed = status === 'passed';

  return (
    <div className="max-w-3xl">
      <button className="text-brand-700 font-medium mb-2 min-h-tap flex items-center" onClick={() => nav('/my')}><Icon name="left" />{t('Мои курсы')}</button>
      <PageTitle sub={pkg.course.description}>{pkg.course.title}</PageTitle>
      <div className="flex flex-wrap gap-2 mb-4">
        <Badge color={STATUS_COLOR[status]}>{t(STATUS_LABEL[status])}</Badge>
        <Badge color={m.offline ? 'teal' : 'slate'}>{m.offline ? t('Доступен офлайн') : t('Онлайн-просмотр')}</Badge>
        <Badge><Icon name="clock" size={14} />{fmtDuration(prog.totalSeconds)}</Badge>
      </div>
      <ProgressBar value={prog.percent} className="mb-5" />
      <div className="space-y-2 mb-6">
        {pkg.materials.map((mat, i) => {
          const done = prog.studiedIds.has(mat.id);
          const sec = prog.byMat.get(mat.id)?.seconds || 0;
          return (
            <Link key={mat.id} to={`/course/${pkg.course.id}/m/${mat.id}`}>
              <Card className="flex items-center gap-3 p-4 hover:border-brand-300">
                <div className={`w-11 h-11 shrink-0 rounded-xl flex items-center justify-center ${done ? 'bg-emerald-100 text-emerald-700' : 'bg-brand-50 text-brand-700'}`}>
                  <Icon name={done ? 'check' : MAT_ICON[mat.type]} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">{i + 1}. {mat.title}</div>
                  <div className="text-sm text-slate-500">
                    {mat.type === 'link' ? t('Справочно · не обязательно · требует сети') : mat.min_seconds ? `${t('Минимум')} ${fmtDuration(mat.min_seconds)} · ${t('изучено')} ${fmtDuration(Math.min(sec, mat.min_seconds))}` : done ? t('Изучено') : t('Откройте материал')}
                  </div>
                </div>
                <Icon name="right" className="text-slate-400" />
              </Card>
            </Link>
          );
        })}
      </div>
      {pkg.test && (
        <Card className="p-4">
          <div className="font-bold text-lg mb-1">{pkg.test.title}</div>
          <div className="text-slate-600 mb-3">
            {pkg.test.questions.length} {t('вопросов')} · {t('проходной балл')} {pkg.course.pass_score}% · {t('попыток осталось')}: {left} {t('из')} {pkg.test.max_attempts}
          </div>
          {!prog.allStudied && !passed && <div className="mb-3"><Alert kind="info">{t('Тест откроется после изучения всех материалов.')}</Alert></div>}
          <Button big icon="tasks" disabled={!prog.allStudied || left === 0 || passed} onClick={() => nav(`/course/${pkg.course.id}/test`)}>
            {passed ? t('Курс сдан') : left === 0 ? t('Попытки закончились') : t('Пройти тест')}
          </Button>
        </Card>
      )}
      {pkg.scenario && (
        <Card className="p-4 mt-4 flex items-center gap-3" onClick={() => nav(`/trainer/${pkg.scenario!.id}`)}>
          <Icon name="chat" className="text-brand-700" />
          <div className="flex-1"><div className="font-semibold">{t('Тренажёр')}: {pkg.scenario.title}</div><div className="text-sm text-slate-500">{pkg.scenario.description}</div></div>
          <Icon name="right" className="text-slate-400" />
        </Card>
      )}
    </div>
  );
}

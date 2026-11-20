import { useLiveQuery } from 'dexie-react-hooks';
import type { CoursePackage, PkgMaterial, ServerAttempt, SyncState } from '../types';
import { db, type AttemptRec, type ProgressRec } from './db';

export function useSyncState(userId: string | undefined): SyncState | null | undefined {
  return useLiveQuery(async () => (userId ? ((await db.meta.get(`syncState:${userId}`))?.value as SyncState) ?? null : null), [userId]);
}

export function materialStudied(m: PkgMaterial, p: ProgressRec | undefined): boolean {
  if (!p?.opened) return false;
  if (m.type === 'link') return true;
  return p.seconds >= (m.min_seconds || 0);
}

/**
 * Внешние ссылки справочные и без сети не открываются, поэтому в прогресс и в условие допуска к тесту
 * не входят — иначе курс со ссылкой нельзя пройти в авиарежиме.
 */
export function materialRequired(m: PkgMaterial): boolean {
  return m.type !== 'link';
}

/** Следующий шаг по курсу: первый обязательный неизученный материал («Материал 2 из 4»). null — все изучены. */
export function nextMaterial(mats: PkgMaterial[], byMat: Map<string, ProgressRec>): { material: PkgMaterial; index: number; total: number } | null {
  const i = mats.findIndex((m) => materialRequired(m) && !materialStudied(m, byMat.get(m.id)));
  return i < 0 ? null : { material: mats[i], index: i + 1, total: mats.length };
}

export function studyProgress(mats: PkgMaterial[], byMat: Map<string, ProgressRec>) {
  const required = mats.filter(materialRequired);
  const done = required.filter((m) => materialStudied(m, byMat.get(m.id))).length;
  return {
    percent: required.length ? Math.round((100 * done) / required.length) : mats.length ? 100 : 0,
    allStudied: mats.length > 0 && done === required.length,
  };
}

export interface MergedAttempt {
  id: string;
  testId: string;
  courseId: string;
  status: string;
  score: number | null;
  clientScore: number | null;
  finishedAt: string | null;
  certificate: { id?: string; number: string } | null;
  synced: boolean;
  local?: AttemptRec;
}

/** Объединение локальных попыток и серверных (из /sync/state), без дублей. Итог — серверная оценка, если есть. */
export function mergeAttempts(local: AttemptRec[], server: ServerAttempt[]): MergedAttempt[] {
  const map = new Map<string, MergedAttempt>();
  for (const s of server) {
    map.set(s.id, {
      id: s.id, testId: s.test_id, courseId: s.course_id || '', status: s.status, score: s.score, clientScore: s.client_score,
      finishedAt: s.finished_at, certificate: s.certificate ? { id: s.certificate.id, number: s.certificate.number } : null, synced: true,
    });
  }
  for (const a of local) {
    if (a.status === 'in_progress') continue;
    const s = map.get(a.id);
    if (s) {
      s.local = a;
      continue;
    }
    map.set(a.id, {
      id: a.id, testId: a.testId, courseId: a.courseId, status: a.serverStatus || a.status, score: a.serverScore ?? null,
      clientScore: a.clientScore ?? null, finishedAt: a.finishedAt || null,
      certificate: a.certificateNumber ? { number: a.certificateNumber } : null, synced: a.serverStatus != null, local: a,
    });
  }
  return [...map.values()].sort((x, y) => (y.finishedAt || '').localeCompare(x.finishedAt || ''));
}

/** Попытка из прошлого цикла обучения (до «повторного обучения»)? */
export function isArchived(a: MergedAttempt, state: SyncState | null | undefined): boolean {
  const reset = state?.assignments.find((x) => x.course_id === a.courseId)?.reset_at;
  if (!reset) return false;
  const when = a.finishedAt || a.local?.startedAt || '';
  return !!when && new Date(when).getTime() < new Date(reset).getTime();
}

/**
 * Попытки сотрудника (сервер + локальные). По умолчанию — только текущий цикл обучения: после повторного
 * назначения старые попытки не влияют на статус и счётчик попыток. withHistory — все попытки (экран «Мои результаты»).
 */
export function useAttempts(userId: string | undefined, state: SyncState | null | undefined, withHistory = false) {
  const local = useLiveQuery(() => (userId ? db.attempts.where('userId').equals(userId).toArray() : []), [userId], []);
  const all = mergeAttempts(local || [], state?.attempts || []);
  return withHistory ? all : all.filter((a) => !isArchived(a, state));
}

export function courseStatus(attempts: MergedAttempt[], courseId: string, anyProgress: boolean): 'passed' | 'failed' | 'pending_review' | 'in_progress' | 'not_started' {
  const mine = attempts.filter((a) => a.courseId === courseId);
  if (mine.some((a) => a.status === 'passed')) return 'passed';
  if (mine.some((a) => a.status === 'pending_review')) return 'pending_review';
  if (mine.length) return 'failed';
  return anyProgress ? 'in_progress' : 'not_started';
}

export function useCourseProgress(userId: string | undefined, pkg: CoursePackage | null | undefined) {
  const recs = useLiveQuery(
    () => (userId && pkg ? db.progress.where('[userId+courseId]').equals([userId, pkg.course.id]).toArray() : []),
    [userId, pkg?.course.id],
    [],
  );
  const byMat = new Map((recs || []).map((r) => [r.materialId, r]));
  const mats = pkg?.materials || [];
  const studied = mats.filter((m) => materialStudied(m, byMat.get(m.id)));
  return {
    byMat,
    studiedIds: new Set(studied.map((m) => m.id)),
    ...studyProgress(mats, byMat),
    anyProgress: (recs || []).length > 0,
    totalSeconds: (recs || []).reduce((s, r) => s + r.seconds, 0),
  };
}

export const STATUS_LABEL: Record<string, string> = {
  passed: 'Сдан', failed: 'Не сдан', pending_review: 'На проверке', in_progress: 'В процессе', not_started: 'Не начат',
};
export const STATUS_COLOR: Record<string, 'green' | 'red' | 'amber' | 'blue' | 'slate'> = {
  passed: 'green', failed: 'red', pending_review: 'amber', in_progress: 'blue', not_started: 'slate',
};

/** Скачивание офлайн-пакета курса (раздел 7.2). */
import { api, apiBlob } from '../api/client';
import type { CoursePackage } from '../types';
import { sha256Blob } from './answerHash';
import { db } from './db';

export interface Progress { done: number; total: number; file?: string }

export class StorageError extends Error {}

async function fetchWithRetry(url: string, sha: string, tries = 3): Promise<Blob> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const blob = await apiBlob(url);
      const h = await sha256Blob(blob);
      if (sha && h !== sha) throw new Error('Контрольная сумма не совпала');
      return blob;
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw last;
}

export async function downloadCourse(courseId: string, onProgress: (p: Progress) => void): Promise<'complete' | 'partial'> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* не критично */
  }
  const pkg = await api<CoursePackage>(`/api/courses/${courseId}/package`);
  const files = pkg.materials.filter((m) => m.file).map((m) => m.file!);
  const need = files.filter((f) => f.sha256);
  const total = need.reduce((s, f) => s + (f.size || 0), 0);
  const est = await navigator.storage?.estimate?.();
  if (est && est.quota && est.usage != null && est.quota - est.usage < total * 1.2) {
    const mb = (x: number) => (x / 1024 / 1024).toFixed(1);
    throw new StorageError(`Недостаточно места: нужно ${mb(total * 1.2)} МБ, свободно ${mb(est.quota - est.usage)} МБ`);
  }
  const old = await db.courses.get(courseId);
  const missing: string[] = [];
  let done = 0;
  onProgress({ done, total });
  for (const f of need) {
    const have = await db.files.get(f.id);
    if (have && have.sha256 === f.sha256) {
      done += f.size;
      onProgress({ done, total });
      continue;
    }
    try {
      const blob = await fetchWithRetry(f.url, f.sha256);
      await db.files.put({ id: f.id, blob, mime: f.mime, size: blob.size, sha256: f.sha256 });
    } catch {
      missing.push(f.id);
    }
    done += f.size;
    onProgress({ done, total, file: f.id });
  }
  const status = missing.length ? 'partial' : 'complete';
  await db.transaction('rw', db.courses, db.tests, db.scenarios, db.files, async () => {
    await db.courses.put({ id: courseId, version: pkg.course.version, manifest: pkg, downloadedAt: Date.now(), status, missing });
    if (pkg.test) {
      await db.tests.put({ id: pkg.test.id, courseId, courseVersion: pkg.course.version, passScore: pkg.course.pass_score, test: pkg.test });
    }
    if (pkg.scenario) await db.scenarios.put({ id: pkg.scenario.id, scenario: pkg.scenario });
    // обновление: старые файлы удаляются только после успешной загрузки новых
    if (old && status === 'complete') {
      const keep = new Set(need.map((f) => f.id));
      const stale = old.manifest.materials.filter((m) => m.file && !keep.has(m.file.id)).map((m) => m.file!.id);
      if (stale.length) await db.files.bulkDelete(stale);
    }
  });
  return status;
}

export async function removeCourse(courseId: string) {
  const c = await db.courses.get(courseId);
  if (!c) return;
  const ids = c.manifest.materials.filter((m) => m.file).map((m) => m.file!.id);
  await db.files.bulkDelete(ids);
  await db.courses.delete(courseId);
}

const memo = new Map<string, CoursePackage>();

/** Манифест курса: из IndexedDB (офлайн) или с сервера (онлайн, без сохранения). */
export async function getManifest(courseId: string): Promise<{ pkg: CoursePackage; offline: boolean } | null> {
  const c = await db.courses.get(courseId);
  if (c) return { pkg: c.manifest, offline: true };
  if (memo.has(courseId)) return { pkg: memo.get(courseId)!, offline: false };
  try {
    const pkg = await api<CoursePackage>(`/api/courses/${courseId}/package`);
    memo.set(courseId, pkg);
    if (pkg.test) {
      // тест нужен для прохождения даже без «скачать офлайн» (хэши, не ответы)
      await db.tests.put({ id: pkg.test.id, courseId, courseVersion: pkg.course.version, passScore: pkg.course.pass_score, test: pkg.test });
    }
    if (pkg.scenario) await db.scenarios.put({ id: pkg.scenario.id, scenario: pkg.scenario });
    return { pkg, offline: false };
  } catch {
    return null;
  }
}

/** Blob файла: из IndexedDB или с сервера. */
export async function getFileBlob(fileId: string, url: string): Promise<Blob> {
  const f = await db.files.get(fileId);
  if (f) return f.blob;
  return apiBlob(url);
}

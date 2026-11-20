import Dexie, { type Table } from 'dexie';
import type { Answer, AssessmentTask, CoursePackage, LibraryItem, PkgTest, Scenario, User } from '../types';

export interface SessionRec { key: 'current'; token: string; user: User; expiresAt: string }
/** Устройство регистрируется отдельно для каждого пользователя (key = userId), см. docs/decisions.md */
export interface DeviceRec { key: string; deviceId: string; secretB64: string; name: string }
export interface CourseRec {
  id: string;
  version: number;
  manifest: CoursePackage;
  downloadedAt: number;
  status: 'complete' | 'partial';
  missing: string[];
}
export interface FileRec { id: string; blob: Blob; mime: string; size: number; sha256: string }
export interface TestRec { id: string; courseId: string; courseVersion: number; passScore: number; test: PkgTest }
export interface AttemptRec {
  id: string;
  testId: string;
  courseId: string;
  userId: string;
  courseVersion: number;
  status: 'in_progress' | 'passed' | 'failed' | 'pending_review';
  answers: Record<string, Answer>;
  questionOrder: string[];
  currentIndex: number;
  startedAt: string;
  startedMono?: number;
  startedPage?: string;
  finishedAt?: string;
  clientScore?: number;
  results?: { question_id: string; is_correct: boolean | null; points: number; needs_review: boolean }[];
  serverScore?: number;
  serverStatus?: string;
  certificateNumber?: string | null;
}
export type OutboxKind = 'event' | 'attempt' | 'assessment_response' | 'scenario_run';
export interface OutboxItem {
  id: string;
  kind: OutboxKind;
  payload: Record<string, any>;
  status: 'pending' | 'sent' | 'sent_qr' | 'rejected';
  createdAt: number;
  tries: number;
  userId: string;
  reason?: string;
  qrBatch?: string;
}
export interface LibraryRec { id: string; item: LibraryItem; savedFile: boolean }
export interface ScenarioRec { id: string; scenario: Scenario }
export interface AssessmentRec { id: string; userId: string; task: AssessmentTask; submitted: boolean }
export interface MetaRec { key: string; value: any }
export interface ProgressRec { key: string; userId: string; courseId: string; materialId: string; seconds: number; opened: boolean }

class LmsDb extends Dexie {
  session!: Table<SessionRec, string>;
  device!: Table<DeviceRec, string>;
  courses!: Table<CourseRec, string>;
  files!: Table<FileRec, string>;
  tests!: Table<TestRec, string>;
  attempts!: Table<AttemptRec, string>;
  outbox!: Table<OutboxItem, string>;
  library!: Table<LibraryRec, string>;
  scenarios!: Table<ScenarioRec, string>;
  assessments!: Table<AssessmentRec, string>;
  meta!: Table<MetaRec, string>;
  progress!: Table<ProgressRec, string>;

  constructor() {
    super('dolcepharm-lms');
    this.version(1).stores({
      session: 'key',
      device: 'key',
      courses: 'id, version',
      files: 'id',
      tests: 'id, courseId',
      attempts: 'id, testId, status, userId, [userId+testId]',
      outbox: 'id, kind, status, createdAt, userId, [userId+status], qrBatch',
      library: 'id',
      scenarios: 'id',
      assessments: 'id, userId',
      meta: 'key',
      progress: 'key, userId, [userId+courseId]',
    });
  }
}

export const db = new LmsDb();

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const r = await db.meta.get(key);
  return r ? (r.value as T) : fallback;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}

export type Role = 'admin' | 'methodist' | 'manager' | 'employee';

export interface User {
  id: string;
  full_name: string;
  login: string;
  role: Role;
  position: string | null;
  department_id: string | null;
  department_name: string | null;
  manager_id: string | null;
  lang: 'ru' | 'kk';
  is_active: boolean;
}

export interface PkgFile { id: string; url: string; mime: string; size: number; sha256: string; status?: string }

export interface PkgMaterial {
  id: string;
  position: number;
  type: 'pdf' | 'video' | 'doc' | 'xls' | 'ppt' | 'link' | 'text';
  title: string;
  min_seconds: number;
  body_md?: string;
  url?: string;
  file?: PkgFile;
}

export interface PkgOption { id: string; text: string; option_hash?: string }

export interface PkgQuestion {
  id: string;
  type: 'single' | 'multi' | 'open' | 'order';
  body: string;
  points: number;
  explanation?: string;
  options?: PkgOption[];
  answer_hash?: string;
  position_hashes?: string[];
  keyword_hashes?: string[];
  keywords_min?: number;
}

export interface PkgTest {
  id: string;
  title: string;
  time_limit_min: number | null;
  max_attempts: number;
  shuffle_questions: boolean;
  salt: string;
  questions: PkgQuestion[];
}

export interface ScenarioChoice { text: string; next: string; score: number }
export interface ScenarioNode {
  speaker?: string;
  emotion?: Emotion;
  background?: string;
  text: string;
  choices?: ScenarioChoice[];
  end?: boolean;
  feedback?: string;
}
export type Emotion = 'calm' | 'worried' | 'angry' | 'scared' | 'happy';
export interface ScenarioData {
  characters?: Record<string, { name: string }>;
  backgrounds?: string[];
  nodes: Record<string, ScenarioNode>;
  start: string;
}
export interface Scenario { id: string; title: string; description: string; course_id: string | null; data: ScenarioData }

export interface CoursePackage {
  course: { id: string; title: string; version: number; pass_score: number; description: string; cover_color?: string };
  materials: PkgMaterial[];
  test: PkgTest | null;
  scenario: Scenario | null;
  package_built_at: string;
}

export interface Answer {
  selected_option_ids?: string[];
  order_option_ids?: string[];
  answer_text?: string;
}

export interface ServerAttempt {
  id: string;
  test_id: string;
  course_id: string | null;
  course_title: string;
  course_version: number;
  score: number;
  client_score: number | null;
  status: 'passed' | 'failed' | 'pending_review';
  source: string;
  started_at: string | null;
  finished_at: string | null;
  certificate: { id: string; number: string; verify_code: string } | null;
}

export interface AssignmentState {
  id: string;
  course_id: string;
  title: string;
  description: string;
  version: number;
  cover_color: string;
  pass_score: number;
  due_date: string | null;
  materials_count: number;
  test_id: string | null;
  max_attempts: number | null;
  /** Повторное обучение: попытки до этого момента — история, в статус и лимит попыток не входят */
  reset_at?: string | null;
}

export interface SyncState {
  server_now: string;
  assignments: AssignmentState[];
  attempts: ServerAttempt[];
  certificates: { id: string; number: string; verify_code: string; course_id: string; course_title: string; issued_at: string }[];
  open_assessment_tasks: number;
}

export interface Competency { id: string; name: string; description: string }

export interface AssessmentTask {
  id: string;
  title: string;
  period: string;
  subject_id: string;
  subject_name: string;
  subject_position: string | null;
  rater_role: 'self' | 'manager' | 'peer';
  completed: boolean;
  competencies: Competency[];
  answers: Record<string, { score: number; comment: string | null }>;
}

export interface FileInfo {
  id: string;
  original_name: string;
  mime: string;
  size_bytes: number;
  offline_mime: string | null;
  offline_size_bytes: number;
  sha256: string | null;
  conversion_status: 'ready' | 'processing' | 'failed';
  conversion_error: string | null;
}

export interface LibraryItem {
  id: string;
  title: string;
  description: string;
  category_id: string | null;
  file_id: string | null;
  file: FileInfo | null;
  tags: string[];
  allow_offline: boolean;
}

export interface Category { id: string; name: string; kind: 'course' | 'library'; parent_id: string | null }
export interface Department { id: string; name: string }

export interface ReportColumn { key: string; title: string }
export interface ReportData { columns: ReportColumn[]; rows: Record<string, unknown>[]; cards?: Record<string, number | string>; by_department?: Record<string, number | string>[] }

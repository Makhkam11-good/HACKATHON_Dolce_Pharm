/**
 * Клиентская (предварительная) оценка теста. Зеркало backend/app/services/grading.py —
 * обе реализации прогоняются на общих кейсах backend/tests/grading_cases.json.
 */
import type { Answer, PkgTest } from '../types';
import { keywordHash, optionHash, positionHash, singleHash } from './answerHash';

export interface PlainOption { id: string; is_correct?: boolean; correct_order?: number | null }
export interface PlainQuestion {
  id: string;
  type: 'single' | 'multi' | 'open' | 'order';
  points: number;
  options?: PlainOption[];
  keywords?: string[];
  keywords_min?: number | null;
}
export interface OpenInfo { matched: number; stemsCount: number }
export interface QuestionResult { question_id: string; is_correct: boolean | null; points: number; needs_review: boolean; matched_keywords: number }
export interface AttemptResult { answers: QuestionResult[]; points_earned: number; points_max: number; score: number; status: 'passed' | 'failed' | 'pending_review' }

export function normalize(text: string | null | undefined): string[] {
  return (text || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export const stem = (w: string) => w.slice(0, Math.max(4, w.length - 2));

export function keywordStem(k: string): string {
  const w = normalize(k);
  return w.length ? stem(w[0]) : '';
}

export function keywordStems(keywords: string[] | undefined | null): string[] {
  const out: string[] = [];
  for (const k of keywords || []) {
    const s = keywordStem(k);
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

export const round1 = (x: number) => Math.floor(x * 10 + 0.5) / 10;

export function countMatched(stems: string[], text: string | undefined): number {
  const words = normalize(text);
  return stems.filter((s) => words.some((w) => w.startsWith(s))).length;
}

export function gradeQuestion(q: PlainQuestion, a: Answer | undefined, open?: OpenInfo): QuestionResult {
  a = a || {};
  const pts = Number(q.points ?? 1) || 0;
  const opts = q.options || [];
  const res: QuestionResult = { question_id: q.id, is_correct: false, points: 0, needs_review: false, matched_keywords: 0 };
  if (q.type === 'single') {
    const sel = a.selected_option_ids || [];
    const correct = new Set(opts.filter((o) => o.is_correct).map((o) => o.id));
    const ok = sel.length === 1 && correct.has(sel[0]);
    res.is_correct = ok;
    res.points = ok ? pts : 0;
  } else if (q.type === 'multi') {
    const sel = new Set(a.selected_option_ids || []);
    const correct = new Set(opts.filter((o) => o.is_correct).map((o) => o.id));
    const total = correct.size;
    if (total) {
      let c = 0;
      let w = 0;
      sel.forEach((id) => (correct.has(id) ? c++ : w++));
      res.points = (pts * Math.max(0, c - w)) / total;
      res.is_correct = c === total && w === 0;
    }
  } else if (q.type === 'order') {
    const order = a.order_option_ids || [];
    const correctIds = [...opts].sort((x, y) => (x.correct_order ?? 0) - (y.correct_order ?? 0)).map((o) => o.id);
    const n = correctIds.length;
    let hits = 0;
    correctIds.forEach((cid, i) => {
      if (i < order.length && order[i] === cid) hits++;
    });
    if (n) {
      res.points = (pts * hits) / n;
      res.is_correct = hits === n;
    }
  } else if (q.type === 'open') {
    const text = a.answer_text;
    if (normalize(text).length) {
      let matched: number;
      let stemsCount: number;
      if (open) {
        matched = open.matched;
        stemsCount = open.stemsCount;
      } else {
        const stems = keywordStems(q.keywords);
        matched = countMatched(stems, text);
        stemsCount = stems.length;
      }
      res.matched_keywords = matched;
      const need = Math.min(q.keywords_min || 1, stemsCount);
      if (stemsCount && matched >= need) {
        res.is_correct = true;
        res.points = pts;
      } else {
        res.is_correct = null;
        res.needs_review = true;
      }
    }
  }
  return res;
}

export function gradeAttempt(questions: PlainQuestion[], answers: Record<string, Answer>, passScore: number, open: Record<string, OpenInfo> = {}): AttemptResult {
  const results = questions.map((q) => gradeQuestion(q, answers[q.id], open[q.id]));
  let earned = 0;
  for (const r of results) earned += r.points;
  let max = 0;
  for (const q of questions) max += Number(q.points ?? 1) || 0;
  const score = max > 0 ? round1((100 * earned) / max) : 0;
  const status = results.some((r) => r.needs_review) ? 'pending_review' : score >= passScore ? 'passed' : 'failed';
  return { answers: results, points_earned: earned, points_max: max, score, status };
}

/** Восстанавливает «правильные ответы» из хэшей пакета и оценивает попытку офлайн. */
export async function gradeHashed(test: PkgTest, answers: Record<string, Answer>, passScore: number): Promise<AttemptResult> {
  const salt = test.salt;
  const plain: PlainQuestion[] = [];
  const open: Record<string, OpenInfo> = {};
  for (const q of test.questions) {
    const opts = q.options || [];
    if (q.type === 'single') {
      const marked = await Promise.all(opts.map(async (o) => ({ id: o.id, is_correct: (await singleHash(salt, q.id, o.id)) === q.answer_hash })));
      plain.push({ id: q.id, type: q.type, points: q.points, options: marked });
    } else if (q.type === 'multi') {
      const marked = await Promise.all(opts.map(async (o) => ({ id: o.id, is_correct: (await optionHash(salt, o.id, true)) === o.option_hash })));
      plain.push({ id: q.id, type: q.type, points: q.points, options: marked });
    } else if (q.type === 'order') {
      const ph = q.position_hashes || [];
      const marked: PlainOption[] = [];
      for (const o of opts) {
        let pos: number | null = null;
        for (let i = 0; i < ph.length; i++) {
          if ((await positionHash(salt, q.id, i, o.id)) === ph[i]) {
            pos = i + 1;
            break;
          }
        }
        marked.push({ id: o.id, correct_order: pos ?? 999 });
      }
      plain.push({ id: q.id, type: q.type, points: q.points, options: marked });
    } else {
      const hashes = new Set(q.keyword_hashes || []);
      const words = normalize(answers[q.id]?.answer_text);
      const found = new Set<string>();
      for (const w of words) {
        for (let len = 1; len <= w.length; len++) {
          const h = await keywordHash(salt, w.slice(0, len));
          if (hashes.has(h)) found.add(h);
        }
      }
      open[q.id] = { matched: found.size, stemsCount: hashes.size };
      plain.push({ id: q.id, type: 'open', points: q.points, keywords_min: q.keywords_min ?? 1 });
    }
  }
  return gradeAttempt(plain, answers, passScore, open);
}

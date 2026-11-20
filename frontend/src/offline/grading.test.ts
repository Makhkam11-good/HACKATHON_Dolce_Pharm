import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Answer, PkgQuestion, PkgTest } from '../types';
import { keywordHash, optionHash, positionHash, sha256Hex, singleHash } from './answerHash';
import { gradeAttempt, gradeHashed, keywordStems, normalize, round1, stem, type PlainQuestion } from './grading';

interface Case {
  name: string;
  pass_score: number;
  questions: (PlainQuestion & { keywords?: string[] })[];
  answers: Record<string, Answer>;
  expected: { score: number; status: string; points: number[] };
}

// Общие с backend тест-кейсы: одна и та же оценка на сервере и на телефоне
const CASES: Case[] = JSON.parse(readFileSync(fileURLToPath(new URL('../../../backend/tests/grading_cases.json', import.meta.url)), 'utf-8'));

/** То же, что backend/app/services/package.py: превращаем «открытый» вопрос в хэшированный пакет. */
async function toPackage(salt: string, qs: Case['questions']): Promise<PkgTest> {
  const questions: PkgQuestion[] = [];
  for (const q of qs) {
    const opts = q.options || [];
    const base: PkgQuestion = { id: q.id, type: q.type, body: '', points: q.points };
    if (q.type === 'single') {
      base.options = opts.map((o) => ({ id: o.id, text: '' }));
      const c = opts.find((o) => o.is_correct);
      base.answer_hash = c ? await singleHash(salt, q.id, c.id) : '';
    } else if (q.type === 'multi') {
      base.options = await Promise.all(opts.map(async (o) => ({ id: o.id, text: '', option_hash: await optionHash(salt, o.id, !!o.is_correct) })));
    } else if (q.type === 'order') {
      const ordered = [...opts].sort((a, b) => (a.correct_order ?? 0) - (b.correct_order ?? 0));
      base.options = [...opts].reverse().map((o) => ({ id: o.id, text: '' }));
      base.position_hashes = await Promise.all(ordered.map((o, i) => positionHash(salt, q.id, i, o.id)));
    } else {
      base.keyword_hashes = await Promise.all(keywordStems(q.keywords).map((s) => keywordHash(salt, s)));
      base.keywords_min = q.keywords_min ?? 1;
    }
    questions.push(base);
  }
  return { id: 't', title: '', time_limit_min: null, max_attempts: 3, shuffle_questions: false, salt, questions };
}

describe('общие кейсы оценки (совпадают с pytest)', () => {
  for (const c of CASES) {
    it(c.name, () => {
      const g = gradeAttempt(c.questions, c.answers, c.pass_score);
      expect(g.score).toBe(c.expected.score);
      expect(g.status).toBe(c.expected.status);
      g.answers.forEach((r, i) => expect(r.points).toBeCloseTo(c.expected.points[i], 10));
    });
    it(`${c.name} — офлайн по хэшам`, async () => {
      const pkg = await toPackage('salt-' + c.name.length, c.questions);
      const g = await gradeHashed(pkg, c.answers, c.pass_score);
      expect(g.score).toBe(c.expected.score);
      expect(g.status).toBe(c.expected.status);
    });
  }
});

describe('нормализация и хэши', () => {
  it('normalize / stem', () => {
    expect(normalize('Ёлка, ЁЖ!  мастер_смены')).toEqual(['елка', 'еж', 'мастер', 'смены']);
    expect(stem('остановить')).toBe('останови');
    expect(round1(0.25)).toBe(0.3);
  });
  it('sha256 совпадает с Python hashlib', async () => {
    expect(await sha256Hex('salt1:q1:a')).toBe('3d8668d5481fcb6d3f1259460f4ef6444f2389ab42c84ca6812366c3acc351d8');
    expect(await keywordHash('salt1', 'маст')).toBe('3d1501e261585ab4f23116a30685dfcc54beb52d62833e0b52c842f1bed9cd15');
  });
  it('правильный ответ не хранится открытым текстом', async () => {
    const pkg = await toPackage('s', CASES[0].questions);
    expect(JSON.stringify(pkg)).not.toContain('is_correct');
  });
});

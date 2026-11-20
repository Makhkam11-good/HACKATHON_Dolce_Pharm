/** Экспорт с телефона: отчёты 1–3 из локальных данных (работает в авиарежиме). */
import { saveBlob } from '../api/client';
import { db } from './db';
import { cachedState } from './syncEngine';

const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('ru-RU') : '');
const dur = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
const STATUS: Record<string, string> = { passed: 'сдал', failed: 'не сдал', pending_review: 'на проверке', in_progress: 'в процессе' };

export interface Sheet { name: string; columns: string[]; rows: (string | number)[][] }

export async function buildLocalReports(userId: string, userName: string): Promise<Sheet[]> {
  const items = await db.outbox.where('userId').equals(userId).toArray();
  const events: Record<string, any>[] = items.filter((i) => i.kind === "event").map((i) => ({ ...i.payload, status: i.status }) as Record<string, any>).sort((a, b) => a.client_seq - b.client_seq);
  const courses = await db.courses.toArray();
  const matTitle = new Map<string, { title: string; course: string }>();
  courses.forEach((c) => c.manifest.materials.forEach((m) => matTitle.set(m.id, { title: m.title, course: c.manifest.course.title })));
  const state = await cachedState(userId);

  const starts = events.filter((e) => e.type === 'session_start');
  const ends = events.filter((e) => e.type === 'session_end');
  const sessions: Sheet = {
    name: 'Сессии',
    columns: ['ФИО', 'Вход', 'Выход', 'Длительность', 'Отправлено'],
    rows: starts.map((s) => {
      const e = ends.find((x) => x.started_at_client === s.started_at_client);
      return [userName, fmt(s.started_at_client), e ? fmt(e.ended_at_client) : '(открыта)', e ? dur(e.duration_ms) : '', s.status === 'pending' ? 'нет' : 'да'];
    }),
  };

  const agg = new Map<string, { total: number; n: number; first: string; last: string }>();
  for (const e of events.filter((x) => x.type === 'material_interval')) {
    const a = agg.get(e.material_id) || { total: 0, n: 0, first: e.started_at_client, last: e.ended_at_client };
    a.total += e.duration_ms;
    a.n += 1;
    if (e.started_at_client < a.first) a.first = e.started_at_client;
    if (e.ended_at_client > a.last) a.last = e.ended_at_client;
    agg.set(e.material_id, a);
  }
  const materials: Sheet = {
    name: 'Время по материалам',
    columns: ['ФИО', 'Курс', 'Материал', 'Время (чч:мм:сс)', 'Интервалов', 'Первое обращение', 'Последнее обращение'],
    rows: [...agg.entries()].map(([mid, a]) => [userName, matTitle.get(mid)?.course || '', matTitle.get(mid)?.title || mid, dur(a.total), a.n, fmt(a.first), fmt(a.last)]),
  };

  const local = await db.attempts.where('userId').equals(userId).toArray();
  const server = new Map((state?.attempts || []).map((a) => [a.id, a]));
  const titleByCourse = new Map<string, string>();
  courses.forEach((c) => titleByCourse.set(c.id, c.manifest.course.title));
  state?.assignments.forEach((a) => titleByCourse.set(a.course_id, a.title));
  const rows: (string | number)[][] = [];
  const seen = new Set<string>();
  for (const a of local.filter((x) => x.status !== 'in_progress')) {
    seen.add(a.id);
    const s = server.get(a.id);
    rows.push([userName, titleByCourse.get(a.courseId) || '', a.courseVersion, a.clientScore ?? '', s ? s.score : '', STATUS[s?.status || a.status] || a.status, fmt(a.finishedAt), s?.certificate?.number || a.certificateNumber || '']);
  }
  for (const s of state?.attempts || []) {
    if (seen.has(s.id)) continue;
    rows.push([userName, s.course_title, s.course_version, s.client_score ?? '', s.score, STATUS[s.status] || s.status, fmt(s.finished_at), s.certificate?.number || '']);
  }
  const attestation: Sheet = {
    name: 'Аттестация',
    columns: ['ФИО', 'Курс', 'Версия', 'Балл на телефоне, %', 'Балл сервера, %', 'Статус', 'Дата', 'Сертификат'],
    rows,
  };
  return [sessions, materials, attestation];
}

function csvCell(v: string | number) {
  const s = String(v ?? '');
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function sheetsToCsv(sheets: Sheet[]): Blob {
  const parts: string[] = [];
  for (const sh of sheets) {
    parts.push(csvCell(sh.name));
    parts.push(sh.columns.map(csvCell).join(';'));
    sh.rows.forEach((r) => parts.push(r.map(csvCell).join(';')));
    parts.push('');
  }
  return new Blob(['﻿' + parts.join('\r\n')], { type: 'text/csv;charset=utf-8' });
}

export async function sheetsToXlsx(sheets: Sheet[]): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  for (const sh of sheets) {
    const ws = wb.addWorksheet(sh.name.slice(0, 31));
    ws.addRow(sh.columns).font = { bold: true };
    sh.rows.forEach((r) => ws.addRow(r));
    ws.columns.forEach((c, i) => {
      c.width = Math.min(50, Math.max(12, ...sh.rows.map((r) => String(r[i] ?? '').length + 2), sh.columns[i].length + 2));
    });
  }
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export async function exportLocal(userId: string, userName: string, format: 'csv' | 'xlsx') {
  const sheets = await buildLocalReports(userId, userName);
  const blob = format === 'csv' ? sheetsToCsv(sheets) : await sheetsToXlsx(sheets);
  const name = `мои-результаты.${format}`;
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare?.({ files: [file] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
    try {
      await navigator.share({ files: [file], title: 'Мои результаты обучения' });
      return;
    } catch {
      /* пользователь отменил — скачиваем */
    }
  }
  saveBlob(blob, name);
}

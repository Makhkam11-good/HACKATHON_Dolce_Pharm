/**
 * Скриншоты всех экранов для редизайна: iPhone 14, Pixel 7, десктоп 1440.
 *   cd frontend && npm i --no-save playwright-core && node e2e/redesign-shots.mjs before|after [https://localhost]
 * Результат: docs/redesign/<before|after>/<устройство>/<роль>-NN-<экран>.png
 * Серверных данных почти не меняет: курс сохраняется только в браузере, тест начинается, но не завершается.
 * Сотрудник — op16 (без истории: видно «Сохранить на телефон» и «Начать»), не op01/op02 (для живого демо).
 */
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright-core';

const STAGE = process.argv[2] || 'before';
const BASE = process.argv[3] || 'https://localhost';
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../docs/redesign', STAGE);
const executablePath = process.env.CHROME || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
].find((p) => existsSync(p));

const DEVICES = {
  iphone14: { ...devices['iPhone 14'], deviceScaleFactor: 2, safeBottom: 34 },
  pixel7: { ...devices['Pixel 7'], deviceScaleFactor: 2 },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
};

async function api(path, token, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
}

async function session(browser, devName, user, { onboarding = false } = {}) {
  const { safeBottom, ...d } = DEVICES[devName];
  const ctx = await browser.newContext({ ...d, ignoreHTTPSErrors: true, locale: 'ru-RU' });
  if (!onboarding) await ctx.addInitScript(() => { try { localStorage.setItem('onboarding:skip', '1'); } catch { /* */ } });
  if (safeBottom) {
    await ctx.addInitScript((px) => {
      const add = () => { const s = document.createElement('style'); s.textContent = `:root{--safe-bottom:${px}px !important}`; document.head.appendChild(s); };
      if (document.head) add(); else document.addEventListener('DOMContentLoaded', add);
    }, safeBottom);
  }
  const page = await ctx.newPage();
  let n = 0;
  const dir = join(OUT, devName);
  mkdirSync(dir, { recursive: true });
  const shot = async (name, opts = {}) => {
    await page.waitForTimeout(opts.wait ?? 900);
    await page.screenshot({ path: join(dir, `${user || 'guest'}-${String(++n).padStart(2, '0')}-${name}.png`), fullPage: opts.full ?? false });
  };
  const go = async (path, name, opts) => {
    await page.goto(`${BASE}${path}`, { waitUntil: 'load' }).catch(() => {});
    await shot(name, opts);
  };
  if (user) {
    await page.goto(`${BASE}/login`);
    await page.fill('input:not([type="password"])', user);
    await page.fill('input[type="password"]', 'demo123');
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 });
    await page.waitForTimeout(1200);
  }
  return { ctx, page, shot, go };
}

const browser = await chromium.launch({ executablePath, headless: true });
const EMP = process.env.EMP || 'op16';
const op = await api('/api/auth/login', null, { login: EMP, password: 'demo123' });
const state = await api('/api/sync/state', op.access_token);
const course = state.assignments.find((a) => a.title.startsWith('Охрана труда')) || state.assignments[0];
const pkg = await api(`/api/courses/${course.course_id}/package`, op.access_token);
const meth = await api('/api/auth/login', null, { login: 'methodist', password: 'demo123' });
const courses = await api('/api/courses', meth.access_token);
const anyCourse = (Array.isArray(courses) ? courses : courses.items || [])[0];
const assessments = await api('/api/assessments', meth.access_token);

const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
for (const devName of Object.keys(DEVICES).filter((d) => !ONLY.length || ONLY.includes(d))) {
  console.log(`=== ${devName}`);
  const mobile = devName !== 'desktop';

  // гость: вход
  { const s = await session(browser, devName, null); await s.go('/login', 'login'); await s.ctx.close(); }

  // сотрудник: знакомство при первом входе (только телефоны)
  if (mobile) {
    const { ctx, page, shot } = await session(browser, devName, 'op04', { onboarding: true });
    await page.goto(`${BASE}/my`).catch(() => {});
    const dlg = page.getByRole('dialog', { name: /Знакомство/ });
    await dlg.waitFor({ timeout: 15000 }).catch(() => {});
    for (let k = 1; k <= 3 && await dlg.count(); k++) {
      await shot(`onboarding-${k}`, { wait: 400 });
      await dlg.getByRole('button', { name: k < 3 ? 'Далее' : 'Начать обучение' }).click();
    }
    await ctx.close();
  }

  // сотрудник
  {
    const { ctx, page, shot, go } = await session(browser, devName, EMP);
    await go('/my', 'my-courses');
    // сохраняем курс на телефон (новая главная — кнопка в большой карточке или в строке курса)
    for (let k = 0; k < 3; k++) {
      const btn = page.getByRole('button', { name: /Скачать офлайн|Сохранить на телефон/ }).first();
      if (!(await btn.count())) break;
      await btn.click();
      await page.waitForFunction(() => !document.body.innerText.includes('Сохраняем на телефон'), null, { timeout: 120000 }).catch(() => {});
      await page.waitForTimeout(800);
    }
    await shot('my-courses-saved');
    await go(`/course/${course.course_id}`, 'course');
    for (const m of pkg.materials) await go(`/course/${course.course_id}/m/${m.id}`, `material-${m.type}`, { wait: 2000 });
    await go(`/course/${course.course_id}/test`, 'test-start');
    const startBtn = page.getByRole('button', { name: /Начать тест/ });
    if (await startBtn.count() && await startBtn.isEnabled()) {
      await startBtn.click();
      const seen = new Set();
      for (let i = 0; i < 12 && seen.size < 4; i++) {
        const type = await page.locator('[data-qtype]').getAttribute('data-qtype').catch(() => null);
        if (type && !seen.has(type)) { seen.add(type); await shot(`test-${type}`); }
        const next = page.locator('.bottom-bar button').last();
        if (!(await next.count()) || /Завершить/.test(await next.innerText())) {
          if (await next.count()) { await next.click(); await shot('test-confirm-finish'); }
          break;
        }
        await next.click();
      }
    }
    await go('/results', 'results');
    await go('/library', 'library');
    await go('/assess', 'assess-360');
    await go('/trainer', 'trainer');
    const scen = page.locator('main .cursor-pointer').first();
    if (await scen.count()) { await scen.click(); await shot('trainer-scenario', { wait: 1500 }); }
    await go('/qr-transfer', 'qr-transfer');
    if (mobile) {
      await go('/my', 'my-courses-again', { wait: 300 });
      const more = page.getByRole('button', { name: 'Ещё' });
      if (await more.count()) { await more.click(); await shot('more-menu'); }
    }
    await ctx.close();
  }

  // мастер (телефон и ПК)
  {
    const { ctx, go } = await session(browser, devName, 'manager1');
    for (const [p, n] of [['/dash', 'dashboard'], ['/qr-receive', 'qr-receive'], ['/a360', 'assessments-360'], ['/reports', 'reports'], ['/m/assignments', 'assignments']]) await go(p, n);
    await ctx.close();
  }

  // методист (ПК)
  if (!mobile) {
    const { ctx, page, shot, go } = await session(browser, devName, 'methodist');
    for (const [p, n] of [['/m/courses', 'courses'], ['/m/library', 'library'], ['/m/assignments', 'assignments'], ['/m/reviews', 'reviews'],
      ['/m/scenarios', 'scenarios'], ['/m/users', 'users'], ['/reports', 'reports'], ['/qr-receive', 'qr-receive']]) await go(p, n);
    if (anyCourse) { await go(`/m/courses/${anyCourse.id}`, 'course-editor', { full: true }); await go(`/m/courses/${anyCourse.id}/test`, 'test-builder', { full: true }); }
    await go('/a360', 'assessments-360');
    const first = (assessments || []).find((a) => a.status === 'closed');
    if (first) { await page.getByText(first.subject_name).first().click(); await shot('assessment-profile', { full: true, wait: 1500 }); }
    await ctx.close();
  }
}
await browser.close();
console.log(`Скриншоты: ${OUT}`);

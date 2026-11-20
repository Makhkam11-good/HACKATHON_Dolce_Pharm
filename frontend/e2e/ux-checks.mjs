/**
 * Проверки UX после редизайна (раздел 10 брифа):
 *  1) на телефоне все кнопки, ссылки, поля и переключатели ≥ 48×48 px и не перекрыты (elementFromPoint в центре);
 *  2) на ширине 360 px нет горизонтальной прокрутки;
 *  3) контраст текста — WCAG AA (axe-core, правило color-contrast).
 *
 *   cd frontend && npm i --no-save playwright-core axe-core && NODE_EXTRA_CA_CERTS=../nginx/certs/rootCA.pem node e2e/ux-checks.mjs [https://localhost]
 * Сотрудник — op16 (без истории), меняет только его данные (просмотр материалов).
 */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium, devices } from 'playwright-core';

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');
const BASE = process.argv[2] || 'https://localhost';
const executablePath = process.env.CHROME || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
].find((p) => existsSync(p));

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`); if (!cond) failures++; };

const PHONES = {
  'iPhone 14': { ...devices['iPhone 14'], deviceScaleFactor: 1 },
  'Pixel 7': { ...devices['Pixel 7'], deviceScaleFactor: 1 },
  'Android 360': { viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, userAgent: devices['Pixel 7'].userAgent },
};

/** Все интерактивные элементы ≥ 48×48 и сверху в центре — сам элемент. */
async function checkTargets(page, label) {
  const bad = await page.evaluate(() => {
    const sel = 'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="tab"], [role="radio"], [role="checkbox"]';
    const out = [];
    // видимая область — между шапкой и нижним меню; при открытом окне проверяем только его содержимое
    const dialog = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].pop();
    const top = dialog ? 0 : (document.querySelector('header')?.getBoundingClientRect().bottom || 0);
    const bars = dialog ? [] : [...document.querySelectorAll('nav.bottom-nav, .bottom-bar')];
    const bottom = Math.min(innerHeight, ...bars.map((b) => b.getBoundingClientRect().top));
    for (const el of document.querySelectorAll(sel)) {
      if (dialog && !dialog.contains(el)) continue;
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || st.visibility === 'hidden' || st.display === 'none') continue;
      if (el.closest('.hidden, [aria-hidden="true"]')) continue;
      if (el.type === 'file' || el.type === 'color') continue;
      // скрытые за пределами экрана по вертикали (ниже прокрутки) проверяем по размеру, перекрытие — только видимые
      const name = (el.getAttribute('aria-label') || el.innerText || el.value || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40);
      if (r.width < 47.5 || r.height < 47.5) out.push(`мал ${Math.round(r.width)}×${Math.round(r.height)}: ${name}`);
      const fixedBar = el.closest('header, nav.bottom-nav, .bottom-bar');
      const inView = fixedBar ? true : (r.top >= top && r.bottom <= bottom && r.left >= 0 && r.right <= innerWidth);
      if (inView) {
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (hit && hit !== el && !el.contains(hit) && !hit.contains(el) && !(el.tagName === 'INPUT' && el.closest('label')?.contains(hit))) {
          out.push(`перекрыт (${hit.tagName.toLowerCase()}.${String(hit.className).slice(0, 30)}): ${name}`);
        }
      }
    }
    return out;
  });
  ok(!bad.length, `${label}: зоны нажатия ≥ 48px и не перекрыты${bad.length ? ` — ${bad.slice(0, 4).join('; ')}` : ''}`);
}

async function checkScroll(page, label) {
  // с isMobile браузер растягивает страницу под широкий контент — сравниваем с шириной экрана устройства
  const r = await page.evaluate(() => ({ sw: Math.max(document.documentElement.scrollWidth, innerWidth), w: screen.width }));
  ok(r.sw <= r.w + 1, `${label}: нет горизонтальной прокрутки (${r.sw} ≤ ${r.w})`);
}

async function checkContrast(page, label) {
  await page.addScriptTag({ path: AXE });
  const v = await page.evaluate(async () => {
    const res = await window.axe.run(document, { runOnly: { type: 'rule', values: ['color-contrast'] } });
    return res.violations.flatMap((x) => x.nodes.map((n) => `${n.any[0]?.data?.contrastRatio}:1 «${(n.target[0] || '').toString().slice(0, 40)}»`));
  });
  ok(!v.length, `${label}: контраст AA${v.length ? ` — ${v.slice(0, 3).join('; ')}` : ''}`);
}

async function login(page, user) {
  await page.goto(`${BASE}/login`);
  await page.fill('input:not([type="password"])', user);
  await page.fill('input[type="password"]', 'demo123');
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 });
  await page.waitForTimeout(1200);
}

async function api(path, token, body) {
  const r = await fetch(`${BASE}${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return r.json();
}

const browser = await chromium.launch({ executablePath, headless: true });
const op = await api('/api/auth/login', null, { login: 'op16', password: 'demo123' });
const st = await api('/api/sync/state', op.access_token);
const course = st.assignments.find((a) => a.title.startsWith('Охрана')) || st.assignments[0];
const pkg = await api(`/api/courses/${course.course_id}/package`, op.access_token);

for (const [devName, d] of Object.entries(PHONES)) {
  console.log(`\n=== ${devName}`);
  const ctx = await browser.newContext({ ...d, ignoreHTTPSErrors: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('onboarding:skip', '1'); } catch { /* */ } });
  const page = await ctx.newPage();
  const screen = async (label, contrast = devName === 'iPhone 14') => {
    console.log('    →', label);
    await page.waitForTimeout(900);
    await checkTargets(page, label);
    await checkScroll(page, label);
    if (contrast) await checkContrast(page, label);
  };
  await page.goto(`${BASE}/login`);
  await screen('Вход');
  await login(page, 'op16');
  await screen('Главная');
  // сохранить курс
  const card = page.locator('[data-testid="big-action"], [data-course]').filter({ hasText: course.title }).first();
  const save = card.getByRole('button', { name: /Сохранить на телефон/ });
  console.log('    сохранение курса:', await save.count() ? 'нужно' : 'уже сохранён');
  if (await save.count()) {
    await save.click();
    await page.waitForTimeout(500);
    await page.waitForFunction(() => !document.body.innerText.includes('Сохраняем на телефон'), null, { timeout: 120000 });
  }
  await page.goto(`${BASE}/course/${course.course_id}`); await screen('Курс');
  for (const m of pkg.materials) { await page.goto(`${BASE}/course/${course.course_id}/m/${m.id}`); await page.waitForTimeout(1200); await screen(`Материал ${m.type}`); }
  await page.goto(`${BASE}/course/${course.course_id}/test`); await screen('Тест: правила');
  for (const p of ['/results', '/library', '/assess', '/trainer', '/qr-transfer']) { await page.goto(`${BASE}${p}`); await screen(p); }
  await page.goto(`${BASE}/my`); await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Ещё' }).click(); await screen('«Ещё»');
  await ctx.close();

  // мастер на телефоне
  const mctx = await browser.newContext({ ...d, ignoreHTTPSErrors: true });
  const mp = await mctx.newPage();
  await login(mp, 'manager1');
  for (const p of ['/dash', '/qr-receive']) {
    await mp.goto(`${BASE}${p}`); await mp.waitForTimeout(1500);
    await checkTargets(mp, `Мастер ${p}`); await checkScroll(mp, `Мастер ${p}`);
    if (devName === 'iPhone 14') await checkContrast(mp, `Мастер ${p}`);
  }
  await mctx.close();
}

// ПК: контраст на всех экранах методиста и мастера
console.log('\n=== ПК 1440 (контраст)');
for (const user of ['methodist', 'manager1']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  await login(page, user);
  const pages = user === 'methodist'
    ? ['/m/courses', '/m/library', '/m/assignments', '/m/reviews', '/m/scenarios', '/m/users', '/reports', '/a360', '/qr-receive']
    : ['/dash', '/reports', '/a360', '/m/assignments', '/qr-receive'];
  for (const p of pages) { await page.goto(`${BASE}${p}`); await page.waitForTimeout(1500); await checkContrast(page, `${user} ${p}`); await checkScroll(page, `${user} ${p}`); }
  await ctx.close();
}

await browser.close();
console.log(failures ? `\nПровалено проверок: ${failures}` : '\nВсе проверки пройдены');
process.exit(failures ? 1 : 0);

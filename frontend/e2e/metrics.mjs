/**
 * Замер метрик для README (реальный путь оператора в браузере, профиль телефона Pixel 7):
 *  - размер пакета курса на телефоне и время сохранения;
 *  - время открытия приложения и материалов без интернета;
 *  - сколько QR-кодов занимает типичный результат (весь курс + тест) и длительность карусели;
 *  - задержка отправки после появления сети (N повторов).
 *
 *   cd frontend && npm i --no-save playwright-core && node e2e/metrics.mjs [https://localhost] [op17]
 * Результат: docs/metrics.json. Меняет данные указанного сотрудника (проходит курс и тест).
 */
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright-core';

const BASE = process.argv[2] || 'https://localhost';
const USER = process.argv[3] || 'op17';
const COURSE = 'Охрана труда';
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../docs/metrics.json');
const executablePath = process.env.CHROME || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
].find((p) => existsSync(p));

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const r1 = (x) => Math.round(x * 10) / 10;
const log = (...a) => console.log(...a);

const browser = await chromium.launch({ executablePath, headless: true });
const ctx = await browser.newContext({ ...devices['Pixel 7'], ignoreHTTPSErrors: true });
await ctx.addInitScript(() => { try { localStorage.setItem('onboarding:skip', '1'); } catch { /* */ } });
const page = await ctx.newPage();
const M = { measured_at: new Date().toISOString(), device: 'Pixel 7 (эмуляция Chromium), сервер на ноутбуке, доступ https://localhost', user: USER };

// ---- вход и сохранение курса
await page.goto(`${BASE}/login`);
await page.fill('input:not([type="password"])', USER);
await page.fill('input[type="password"]', 'demo123');
await page.click('button[type="submit"]');
await page.waitForURL('**/my');
await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 30000 }).catch(async () => {
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 30000 });
});
const card = page.locator('[data-testid="big-action"], [data-course]').filter({ hasText: COURSE }).first();
const t0 = Date.now();
await card.getByRole('button', { name: /Сохранить на телефон/ }).click();
await page.waitForTimeout(300);
await page.waitForFunction(() => !document.body.innerText.includes('Сохраняем на телефон'), null, { timeout: 120000 });
M.course_save_seconds = r1((Date.now() - t0) / 1000);
const sizes = await page.evaluate(() => new Promise((res) => {
  const rq = indexedDB.open('dolcepharm-lms');
  rq.onsuccess = () => {
    const db = rq.result;
    const tx = db.transaction(['files', 'courses'], 'readonly');
    let files = 0; let manifest = 0;
    tx.objectStore('files').openCursor().onsuccess = (e) => {
      const c = e.target.result;
      if (c) { const v = c.value; files += (v.blob?.size || v.data?.size || 0); c.continue(); }
    };
    tx.objectStore('courses').openCursor().onsuccess = (e) => {
      const c = e.target.result;
      if (c) { manifest += JSON.stringify(c.value.manifest || c.value).length; c.continue(); }
    };
    tx.oncomplete = () => res({ files, manifest });
  };
}));
M.course_package_mb = r1((sizes.files + sizes.manifest) / 1024 / 1024);
M.course_package_files_mb = r1(sizes.files / 1024 / 1024);
log('пакет курса:', M.course_package_mb, 'МБ, сохранение', M.course_save_seconds, 'с');

// ---- открытие без интернета
await ctx.setOffline(true);
const shell = []; const pdf = [];
const courseId = await page.evaluate(() => new Promise((res) => {
  const rq = indexedDB.open('dolcepharm-lms');
  rq.onsuccess = () => { rq.result.transaction('courses').objectStore('courses').getAll().onsuccess = (e) => res(e.target.result.map((c) => ({ id: c.id, title: c.manifest.course.title, mats: c.manifest.materials }))); };
}));
const c = courseId.find((x) => x.title.startsWith(COURSE));
const pdfMat = c.mats.find((m) => m.type === 'pdf');
for (let i = 0; i < 3; i++) {
  const s = Date.now();
  await page.goto(`${BASE}/my`);
  await page.getByRole('heading', { name: /Здравствуйте/ }).waitFor({ timeout: 20000 });
  shell.push((Date.now() - s) / 1000);
  const s2 = Date.now();
  await page.goto(`${BASE}/course/${c.id}/m/${pdfMat.id}`);
  await page.locator('canvas').first().waitFor({ timeout: 20000 });
  pdf.push((Date.now() - s2) / 1000);
}
M.offline_app_open_seconds = r1(median(shell));
M.offline_pdf_open_seconds = r1(median(pdf));
log('без интернета: приложение', M.offline_app_open_seconds, 'с, PDF', M.offline_pdf_open_seconds, 'с');

// ---- типичный результат: весь курс + тест без интернета → сколько QR-кодов
async function stay(sec) { const end = Date.now() + sec * 1000; while (Date.now() < end) { await page.mouse.move(100 + Math.random() * 50, 300); await page.waitForTimeout(2000); } }
for (const m of c.mats) {
  await page.goto(`${BASE}/course/${c.id}/m/${m.id}`);
  await page.waitForTimeout(1000);
  if (m.type !== 'link') await stay((m.min_seconds || 0) + 3);
}
await page.goto(`${BASE}/course/${c.id}/test`);
await page.getByRole('button', { name: 'Начать тест' }).click();
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(250);
  const qtype = await page.locator('[data-qtype]').getAttribute('data-qtype');
  if (qtype === 'single') await page.getByRole('radio').first().click();
  else if (qtype === 'multi') await page.getByRole('checkbox').first().click();
  else if (qtype === 'open') await page.locator('textarea').fill('Сообщить мастеру и использовать средства защиты');
  const fin = page.getByRole('button', { name: 'Завершить тест' });
  if (await fin.isVisible()) { await fin.click(); await page.getByRole('button', { name: 'Завершить', exact: true }).click(); break; }
  await page.getByRole('button', { name: /Далее/ }).click();
}
await page.getByText(/Сохранено на телефоне/).first().waitFor({ timeout: 15000 });
await page.goto(`${BASE}/qr-transfer`);
const pending = Number((await page.getByText(/Ждут отправки:/).first().innerText()).match(/\d+/)[0]);
await page.getByRole('button', { name: 'Показать коды мастеру' }).click();
const codes = Number((await page.getByText(/^Код 1 из \d+$/).innerText()).match(/из (\d+)/)[1]);
M.typical_result_outbox_records = pending;
M.typical_result_qr_codes = codes;
M.qr_carousel_cycle_seconds = codes; // 1 с на код
log('типичный результат:', pending, 'записей →', codes, 'QR-кодов, цикл карусели', codes, 'с');

// ---- задержка отправки после появления сети
const lags = [];
await page.goto(`${BASE}/my`);
await ctx.setOffline(false);
let s = Date.now();
await page.getByText('Всё отправлено').first().waitFor({ timeout: 60000 });
M.sync_full_course_seconds = r1((Date.now() - s) / 1000);
const textMat = c.mats.find((m) => m.type === 'text');
for (let i = 0; i < 5; i++) {
  await ctx.setOffline(true);
  await page.goto(`${BASE}/course/${c.id}/m/${textMat.id}`);
  await stay(4);
  await page.goto(`${BASE}/my`);
  await page.getByText(/Ждёт отправки: \d+/).first().waitFor({ timeout: 15000 });
  s = Date.now();
  await ctx.setOffline(false);
  await page.getByText('Всё отправлено').first().waitFor({ timeout: 60000 });
  lags.push((Date.now() - s) / 1000);
}
M.sync_after_network_seconds = { median: r1(median(lags)), max: r1(Math.max(...lags)), runs: lags.map(r1) };
log('отправка после появления сети:', M.sync_after_network_seconds, '; весь курс + тест:', M.sync_full_course_seconds, 'с');

await browser.close();
writeFileSync(OUT, JSON.stringify(M, null, 2) + '\n');
log('→', OUT);

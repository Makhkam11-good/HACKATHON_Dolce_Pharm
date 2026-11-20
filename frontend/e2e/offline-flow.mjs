/**
 * Браузерный E2E «как на демо»: скачать курс → авиарежим → материалы и тест → сеть → сервер;
 * затем QR-передача без сети, приём у мастера, подделка, повтор.
 *
 *   docker compose up -d
 *   cd frontend && npm i --no-save playwright-core && node e2e/offline-flow.mjs
 * Переменные: BASE (https://localhost), BROWSER (путь к chrome/msedge), HEADED=1.
 */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const require = createRequire(import.meta.url);
const BASE = process.env.BASE || 'https://localhost';
const BROWSER = process.env.BROWSER || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => existsSync(p));
const COURSE = 'Действия при разливе химических веществ';
let n = 0;
const ok = (what) => console.log(`ok ${++n}  ${what}`);
const fail = (what) => {
  console.error(`FAIL  ${what}`);
  process.exit(1);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, token, body) {
  const r = await fetch(BASE + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return r.json();
}

const browser = await chromium.launch({
  executablePath: BROWSER, headless: !process.env.HEADED,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--ignore-certificate-errors'],
});
const phone = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 412, height: 880 }, isMobile: true, hasTouch: true, locale: 'ru-RU' });
const page = await phone.newPage();
page.on('dialog', (d) => d.accept());
page.on('pageerror', (e) => console.log('  pageerror:', e.message));

const m = await api('/api/auth/login', null, { login: 'methodist', password: 'demo123' });
const op = await api('/api/auth/login', null, { login: 'op01', password: 'demo123' });
const courseTime = async () => {
  const rep = await api(`/api/reports/materials-time?user_id=${op.user.id}`, m.access_token);
  return rep.rows.filter((r) => r.course === COURSE).reduce((s, r) => s + r.total_ms, 0) / 1000;
};
const baseline = await courseTime();

// ---------------------------------------------------------------- вход и скачивание
await page.goto(`${BASE}/login`);
await page.getByRole('button', { name: /op01/ }).click();
await page.waitForURL('**/my');
await page.getByRole('heading', { name: 'Мои курсы' }).waitFor();
ok('вход op01');
await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 30000 }).catch(async () => {
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 30000 });
});
ok('service worker управляет страницей');
const card = page.locator('h2', { hasText: COURSE }).locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
await card.getByRole('button', { name: 'Скачать офлайн' }).click();
await card.getByText('Доступен офлайн').waitFor({ timeout: 60000 });
ok('курс скачан офлайн');

const leak = await page.evaluate(() => new Promise((res) => {
  const req = indexedDB.open('dolcepharm-lms');
  req.onsuccess = () => {
    const all = req.result.transaction('tests').objectStore('tests').getAll();
    all.onsuccess = () => res(JSON.stringify(all.result));
  };
}));
if (/is_correct|correct_order|"keywords"/.test(leak)) fail('правильные ответы в IndexedDB');
ok('в IndexedDB нет правильных ответов в открытом виде');

// ---------------------------------------------------------------- авиарежим
await phone.setOffline(true);
await page.reload();
await page.getByRole('heading', { name: 'Мои курсы' }).waitFor({ timeout: 15000 });
await page.getByText('Нет сети — вы можете продолжать обучение').waitFor();
ok('оболочка открывается в авиарежиме, баннер «Нет сети»');

await page.locator('h2', { hasText: COURSE }).click();
await page.getByRole('heading', { name: COURSE }).waitFor();
const mats = page.locator('a[href*="/m/"]');
const matCount = await mats.count();
await mats.first().click();
const t0 = Date.now();
await page.locator('canvas').first().waitFor({ timeout: 20000 });
ok('PPTX (как PDF) отрисован офлайн');
async function stay(sec) {
  const end = Date.now() + sec * 1000;
  while (Date.now() < end) {
    await page.mouse.wheel(0, 120);
    await sleep(1500);
  }
}
await stay(42);
const pptSec = (Date.now() - t0) / 1000;
await page.getByRole('button', { name: /Далее/ }).click();
const t1 = Date.now();
await page.locator('.md').waitFor();
await stay(17);
const txtSec = (Date.now() - t1) / 1000;
ok(`изучено ${matCount} материала офлайн (${pptSec.toFixed(0)} с + ${txtSec.toFixed(0)} с)`);
await page.getByRole('button', { name: /К тесту/ }).click();
await page.getByRole('button', { name: 'Пройти тест' }).click();
await page.getByRole('button', { name: 'Начать тест' }).click();
for (let i = 0; i < 20; i++) {
  await page.getByText(new RegExp(`^Вопрос ${i + 1} из \\d+$`)).waitFor();
  await sleep(200);
  const hint = await page.locator('.text-sm.text-slate-500.mb-4').innerText();
  if (hint.includes('один')) await page.getByRole('radio').first().click();
  else if (hint.includes('все верные')) await page.getByRole('checkbox').first().click();
  else if (hint.includes('своими словами')) await page.locator('textarea').fill('Промыть водой 15 минут и обратиться к врачу');
  else await page.getByRole('button', { name: 'Ниже' }).first().click(); // порядок — стрелкой
  const finish = page.getByRole('button', { name: 'Завершить' });
  if (await finish.isVisible()) {
    await finish.click();
    break;
  }
  await page.getByRole('button', { name: /Далее/ }).click();
}
await page.getByText('Предварительный результат. Итог подтвердится при синхронизации.').waitFor();
const clientScore = await page.locator('.text-6xl').innerText();
ok(`тест пройден офлайн, предварительно ${clientScore}`);
await page.getByText(/Офлайн · \d+ не отправлено/).waitFor();
ok('бейдж: «Офлайн · N не отправлено»');

// ---------------------------------------------------------------- сеть появилась
const tOn = Date.now();
await phone.setOffline(false);
await page.getByText(/Всё отправлено/).waitFor({ timeout: 60000 });
const lag = (Date.now() - tOn) / 1000;
if (lag > 20) fail(`синхронизация заняла ${lag} с (> 20 с)`);
ok(`сеть появилась → всё отправлено за ${lag.toFixed(1)} с`);
await page.getByText('Подтверждено сервером').waitFor({ timeout: 15000 });
ok('результат подтверждён серверной оценкой');

const total = (await courseTime()) - baseline;
const courseId = (await api('/api/sync/state', op.access_token)).assignments.find((a) => a.title === COURSE).course_id;
if (Math.abs(total - (pptSec + txtSec)) > 8) fail(`время на материалах ${total} с, ожидалось ≈ ${(pptSec + txtSec).toFixed(0)} с`);
ok(`отчёт: время на материалах ${total.toFixed(0)} с ≈ реальному ${(pptSec + txtSec).toFixed(0)} с`);

// ---------------------------------------------------------------- QR без сети
await phone.setOffline(true);
await page.goto(`${BASE}/course/${courseId}`);
await mats.first().click();
await stay(8);
await page.goto(`${BASE}/qr-transfer`);
await page.getByRole('button', { name: 'Показать QR-коды' }).click();
await page.getByText(/^Код 1 из \d+$/).waitFor();
const total_n = Number((await page.getByText(/^Код 1 из \d+$/).innerText()).match(/из (\d+)/)[1]);
await page.getByRole('button', { name: 'Пауза' }).click();
await page.addScriptTag({ path: require.resolve('jsqr/dist/jsQR.js') });
const chunks = new Set();
for (let i = 0; i < total_n * 2 && chunks.size < total_n; i++) {
  const txt = await page.evaluate(async () => {
    const img = document.querySelector('img[alt^="QR"]');
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    return window.jsQR(d.data, d.width, d.height)?.data;
  });
  if (txt) chunks.add(txt);
  await page.getByRole('button', { name: 'Вперёд' }).click();
  await sleep(150);
}
if (chunks.size !== total_n) fail(`распознано ${chunks.size} из ${total_n} QR`);
ok(`телефон показал ${total_n} QR-кодов, все распознаются jsQR`);

const laptop = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 }, locale: 'ru-RU' });
const mp = await laptop.newPage();
await mp.goto(`${BASE}/login`);
await mp.getByRole('button', { name: /manager1/ }).click();
await mp.waitForURL('**/dash');
await mp.goto(`${BASE}/qr-receive`);
const feed = async (list) => {
  await mp.locator('#qr-manual').fill([...list].join('\n'));
  await mp.getByRole('button', { name: 'Добавить' }).click();
};
await feed([...chunks].reverse());
await mp.getByText(/^Принято: \d+ событий/).waitFor({ timeout: 20000 });
ok(`мастер принял пакет: ${await mp.getByText(/^Принято: \d+ событий/).innerText()}`);
await mp.getByRole('button', { name: 'Демо: отправить изменённый пакет' }).click();
await mp.getByText('Подпись не совпала — пакет изменён или подделан. Данные не приняты.').waitFor();
ok('изменённый пакет отклонён: «Подпись не совпала»');
await mp.getByRole('button', { name: 'Новый приём' }).click();
await feed(chunks);
await mp.getByText(/Пакет уже был принят ранее/).waitFor();
ok('повторное сканирование того же пакета: «уже был принят», без дублей');

await page.getByRole('button', { name: 'Готово, мастер принял' }).click();
await phone.setOffline(false);
await page.goto(`${BASE}/my`);
await page.getByText(/Всё отправлено/).waitFor({ timeout: 40000 });
ok('после появления сети те же записи ушли через /sync (сервер отбросил как дубли)');
const sess = await api(`/api/reports/materials-time?user_id=${op.user.id}`, m.access_token);
const sync = await api(`/api/reports/sync?user_id=${op.user.id}`, m.access_token);
const qrRow = sync.rows.find((r) => r.source === 'QR');
const dupRow = sync.rows.find((r) => r.source !== 'QR' && r.duplicates > 0);
if (!qrRow || !dupRow) fail('в отчёте синхронизации нет QR-пачки или дублей');
ok(`отчёт синхронизации: QR-пачка (${qrRow.accepted} принято) и сетевая (${dupRow.duplicates} дублей, 0 новых строк)`);
if (!sess.rows.length) fail('нет времени по материалам');

await browser.close();
console.log(`\nE2E OK (${n} проверок)`);

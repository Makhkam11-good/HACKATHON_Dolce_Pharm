/**
 * E2E: кнопки «Назначить» в профиле оценки 360 (manager1, демо-данные seed).
 *   cd frontend && npm i --no-save playwright-core && node e2e/assign-360.mjs [https://localhost]
 * Меняет данные (назначает курс Ахметову, повторное обучение Сидорову) — после прогона
 * демо-базу можно пересоздать: docker compose exec backend python -m seed.seed --force
 */
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

const BASE = process.argv[2] || 'https://localhost';
const executablePath = process.env.CHROME || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
].find((p) => existsSync(p));

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`);
  if (!cond) failures++;
};

const browser = await chromium.launch({ executablePath, headless: true });
const page = await (await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1366, height: 768 } })).newPage();
page.on('dialog', (d) => void d.accept());

await page.goto(`${BASE}/login`);
await page.fill('input:not([type="password"])', 'manager1');
await page.fill('input[type="password"]', 'demo123');
await page.click('button[type="submit"]');
await page.waitForURL('**/dash');

const openProfile = async (name) => {
  await page.goto(`${BASE}/a360`);
  await page.getByText(name).first().click();
  await page.getByText('Рекомендованные курсы').waitFor();
};
const row = (title) => page.locator('li[data-course]').filter({ hasText: title });
const toastVisible = async (re) => {
  const t = page.locator('[role="status"]').filter({ hasText: re });
  await t.waitFor({ timeout: 10000 });
  const box = await t.boundingBox();
  return box && box.y >= 0 && box.y + box.height <= 768;
};

console.log('=== Ахметов: статусы при загрузке');
await openProfile('Ахметов Нурлан Серикович');
const spill = row('Действия при разливе');
const safety = row('Охрана труда');
ok(await spill.getByText('не назначен').count() > 0, '«Действия при разливе»: «не назначен»');
ok(await spill.getByRole('button', { name: 'Назначить' }).isEnabled(), '«Действия при разливе»: кнопка «Назначить»');
ok(await safety.getByRole('button', { name: 'Уже назначен' }).isDisabled(), '«Охрана труда»: «Уже назначен», без кнопки назначения');
ok(await safety.getByText(/не начат/).count() > 0 && await safety.getByText(/до \d\d\.\d\d\.\d{4}/).count() > 0, '«Охрана труда»: статус и срок');

console.log('=== ошибка видна');
await page.route('**/api/assignments', (r) => r.fulfill({ status: 403, contentType: 'application/json',
  body: JSON.stringify({ detail: { code: 'forbidden', message: 'Руководитель назначает только в своём подразделении' } }) }));
await spill.getByRole('button', { name: 'Назначить' }).click();
ok(await spill.getByText('Руководитель назначает только в своём подразделении').count() > 0 || await spill.locator('[class*="bg-red-50"]').waitFor({ timeout: 5000 }).then(() => true), 'ошибка показана в строке курса');
ok(await toastVisible(/Руководитель назначает/), 'ошибка показана уведомлением в видимой части экрана');
await page.unroute('**/api/assignments');

console.log('=== назначение');
await spill.getByRole('button', { name: 'Назначить' }).click();
ok(await toastVisible(/Курс назначен: Ахметов Нурлан Серикович/), 'уведомление «Курс назначен: Ахметов Нурлан Серикович» в видимой части экрана');
ok(await spill.getByRole('button', { name: /Назначено ✓/ }).isDisabled(), 'кнопка стала «Назначено ✓» и неактивна');
ok(await spill.getByText(/не начат/).count() > 0 && await spill.getByText(/до \d\d\.\d\d\.\d{4}/).count() > 0, 'в строке появились статус «не начат» и срок');

console.log('=== повторное открытие профиля');
await openProfile('Ахметов Нурлан Серикович');
ok(await row('Действия при разливе').getByRole('button', { name: 'Уже назначен' }).isDisabled(), 'после перезагрузки профиля: «Уже назначен»');

console.log('=== Сидоров: повторное обучение сданного курса');
await openProfile('Сидоров Алексей Викторович');
const sid = row('Охрана труда');
ok(await sid.getByText('сдал').count() > 0, '«Охрана труда»: статус «сдал»');
await sid.getByRole('button', { name: 'Назначить повторно' }).click();
ok(await toastVisible(/Назначено повторное обучение: Сидоров/), 'уведомление «Назначено повторное обучение: Сидоров…»');
ok(await sid.getByRole('button', { name: /Назначено повторно ✓/ }).isDisabled(), 'кнопка «Назначено повторно ✓» неактивна');
ok(await sid.getByText(/не начат/).count() > 0, 'статус сброшен на «не начат»');

await browser.close();
console.log(failures ? `\nПровалено проверок: ${failures}` : '\nВсе проверки пройдены');
process.exit(failures ? 1 : 0);

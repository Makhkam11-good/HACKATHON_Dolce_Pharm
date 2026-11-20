/**
 * E2E: вёрстка экранов сотрудника на iPhone 14 и Pixel 7 + QR-передача «телефон → ПК мастера».
 *
 *   cd frontend && npm i --no-save playwright-core && node e2e/mobile-qr.mjs [https://localhost]
 *
 * Нужен запущенный стек (docker compose up) и Chrome или Edge. Скриншоты — в docs/screenshots/.
 * Что проверяется:
 *  - на каждом экране ключевые кнопки целиком в окне и кликабельны: elementFromPoint в центре кнопки
 *    возвращает саму кнопку, а не таб-бар/панель;
 *  - на просмотре материала и в тесте таб-бар скрыт, панель «Назад / Далее» прижата к низу над safe area;
 *  - последний абзац страницы не уходит под таб-бар.
 * iPhone: Chromium не знает выреза, env(safe-area-inset-bottom) = 0, поэтому вырез имитируется
 * через CSS-переменную --safe-bottom: 34px (ровно то, что Safari подставляет на iPhone 14).
 *  - QR: телефон офлайн показывает карусель → ПК (methodist) принимает с фото кодов → повтор вручную
 *    → «уже принят» → подделка → «Подпись не совпала». Камера ПК — виртуальная (fake device).
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright-core';

const BASE = process.argv[2] || 'https://localhost';
const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = resolve(HERE, '../../docs/screenshots');
const TMP = resolve(HERE, '../node_modules/.e2e-qr');
mkdirSync(SHOTS, { recursive: true });
mkdirSync(TMP, { recursive: true });

const BROWSERS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const executablePath = process.env.CHROME || BROWSERS.find((p) => existsSync(p));

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`);
  if (!cond) failures++;
};

/** Кнопка целиком в окне и сверху в её центре именно она. */
async function clickable(page, locator, name) {
  const el = locator.first();
  await el.waitFor({ state: 'visible', timeout: 15000 });
  const fixed = await el.evaluate((n) => !!n.closest('.bottom-bar, nav, header'));
  if (!fixed) await el.evaluate((n) => n.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(150);
  const box = await el.boundingBox();
  const vp = page.viewportSize();
  const inView = !!box && box.y >= 0 && box.y + box.height <= vp.height + 0.5;
  const top = await el.evaluate((n, [x, y]) => {
    const hit = document.elementFromPoint(x, y);
    return hit === n || n.contains(hit) ? 'self' : hit ? `${hit.tagName.toLowerCase()}.${String(hit.className).slice(0, 40)}` : 'null';
  }, [box.x + box.width / 2, box.y + box.height / 2]);
  ok(inView && top === 'self', `${name}: в окне=${inView}, сверху=${top}`);
}

/** Низ контента (подпись демо-версии в подвале) должен прокручиваться выше таб-бара. */
async function contentClearsNav(page, name) {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(200);
  const r = await page.evaluate(() => {
    const nav = document.querySelector('nav.bottom-nav');
    const foot = document.querySelector('footer');
    if (!nav || !foot) return { nav: !!nav };
    return { nav: true, navTop: nav.getBoundingClientRect().top, footBottom: foot.getBoundingClientRect().bottom - parseFloat(getComputedStyle(foot).paddingBottom) };
  });
  ok(r.nav && r.footBottom <= r.navTop + 0.5, `${name}: последний текст (${Math.round(r.footBottom)}) выше таб-бара (${Math.round(r.navTop)})`);
}

async function navHidden(page, name) {
  ok((await page.locator('nav.bottom-nav').count()) === 0, `${name}: таб-бар скрыт`);
  const r = await page.evaluate(() => {
    const bar = document.querySelector('.bottom-bar');
    if (!bar) return null;
    const b = bar.getBoundingClientRect();
    return { bottom: b.bottom, vh: window.innerHeight, padB: parseFloat(getComputedStyle(bar).paddingBottom) };
  });
  ok(!!r && Math.abs(r.bottom - r.vh) < 1, `${name}: панель прижата к низу экрана (${r && Math.round(r.bottom)}/${r && r.vh}), отступ снизу ${r && r.padB}px`);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(200);
  const f = await page.evaluate(() => {
    const foot = document.querySelector('footer');
    const bar = document.querySelector('.bottom-bar');
    if (!foot || !bar) return null;
    return { footText: foot.getBoundingClientRect().bottom - parseFloat(getComputedStyle(foot).paddingBottom), barTop: bar.getBoundingClientRect().top };
  });
  ok(!!f && f.footText <= f.barTop + 0.5, `${name}: подвал (${f && Math.round(f.footText)}) не уходит под панель (${f && Math.round(f.barTop)})`);
  await page.evaluate(() => window.scrollTo(0, 0));
}

const shot = (page, dev, n, name) => page.screenshot({ path: join(SHOTS, `${dev}-${String(n).padStart(2, '0')}-${name}.png`) });

async function login(page, user) {
  // сразу после `docker compose up` бэкенд может ещё стартовать — ждём /api/health и пробуем ещё раз
  for (let attempt = 1; ; attempt++) {
    try {
      await page.waitForFunction(() => fetch('/api/health', { cache: 'no-store' }).then((r) => r.ok).catch(() => false), null, { timeout: 60000, polling: 1000 }).catch(() => {});
      await page.goto(BASE, { waitUntil: 'load' });
      await page.fill('input:not([type="password"])', user);
      await page.fill('input[type="password"]', 'demo123');
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/(my|dash|m\/courses)/, { timeout: 20000 });
      break;
    } catch (e) {
      if (attempt >= 3) throw e;
      await page.waitForTimeout(3000);
    }
  }
  await page.waitForTimeout(1200);
}

/** Удерживаем «активность», чтобы трекер времени не ставил паузу простоя. */
async function study(page, seconds) {
  for (let s = 0; s < seconds; s += 3) {
    await page.mouse.move(60 + (s % 50), 200);
    await page.waitForTimeout(3000);
  }
}

async function phone(devName, descriptor, user, safeBottom) {
  console.log(`\n=== ${devName} (${user}) ===`);
  const browser = await chromium.launch({ executablePath, headless: true });
  const ctx = await browser.newContext({ ...descriptor, deviceScaleFactor: 2, ignoreHTTPSErrors: true, permissions: ['clipboard-read', 'clipboard-write'] });
  if (safeBottom) {
    await ctx.addInitScript((px) => {
      const add = () => {
        const st = document.createElement('style');
        st.textContent = `:root{--safe-bottom:${px}px !important}`;
        document.head.appendChild(st);
      };
      if (document.head) add();
      else document.addEventListener('DOMContentLoaded', add);
    }, safeBottom);
  }
  const page = await ctx.newPage();
  let n = 1;
  await login(page, user);

  // --- онлайн-экраны
  await page.goto(`${BASE}/my`);
  await page.waitForTimeout(1500);
  await clickable(page, page.getByRole('button', { name: /Скачать офлайн/ }), 'Мои курсы → «Скачать офлайн»');
  await contentClearsNav(page, 'Мои курсы');
  await shot(page, devName, n++, 'my-courses');
  const card = page.locator('a, div').filter({ hasText: 'Охрана труда и техника' }).filter({ has: page.getByRole('button', { name: /Скачать офлайн/ }) }).last();
  await card.getByRole('button', { name: /Скачать офлайн/ }).click();
  await page.getByText('Доступен офлайн').first().waitFor({ timeout: 180000 });

  for (const [path, name, btn] of [
    ['/library', 'library', null],
    ['/assess', 'assess-360', null],
    ['/trainer', 'trainer', null],
  ]) {
    await page.goto(`${BASE}${path}`);
    await page.waitForTimeout(1800);
    await contentClearsNav(page, name);
    await shot(page, devName, n++, name);
  }
  const scen = page.locator('main .cursor-pointer').first();
  if (await scen.count()) {
    await scen.click();
    await page.waitForTimeout(1500);
    const choice = page.locator('main button.text-left').last();
    if (await choice.count()) await clickable(page, choice, 'Тренажёр: вариант ответа');
    await shot(page, devName, n++, 'trainer-scenario');
  }
  await page.getByRole('button', { name: 'Ещё' }).click();
  await page.waitForTimeout(500);
  await clickable(page, page.getByRole('button', { name: /Передать мастеру без сети/ }), '«Ещё» → главная кнопка «Передать мастеру без сети»');
  await shot(page, devName, n++, 'more-menu');
  await page.keyboard.press('Escape');

  // --- авиарежим: курс, материалы, тест
  await ctx.setOffline(true);
  await page.goto(`${BASE}/my`).catch(() => {});
  await page.waitForTimeout(1200);
  await page.getByText('Охрана труда и техника', { exact: false }).first().click();
  await page.waitForTimeout(1200);
  const courseUrl = page.url();
  await contentClearsNav(page, 'Курс');
  await shot(page, devName, n++, 'course');

  const mats = [['pdf', 62], ['video', 22], ['text', 17], ['link', 1]];
  for (let i = 0; i < mats.length; i++) {
    const [kind, sec] = mats[i];
    await page.goto(courseUrl);
    await page.waitForTimeout(800);
    await page.locator('a[href*="/m/"]').nth(i).click({ timeout: 15000 }).catch(async (e) => {
      console.log('URL:', page.url(), '| TEXT:', (await page.innerText('body').catch(() => '?')).replace(/\s+/g, ' ').slice(0, 400));
      throw e;
    });
    await page.waitForTimeout(1500);
    await navHidden(page, `Материал ${kind}`);
    await clickable(page, page.locator('.bottom-bar button').first(), `Материал ${kind}: «Назад»`);
    await clickable(page, page.locator('.bottom-bar button').last(), `Материал ${kind}: «Далее / К тесту»`);
    await page.waitForTimeout(1500);
    await shot(page, devName, n++, `material-${kind}`);
    if (kind === 'text' || kind === 'pdf') {
      // последний абзац материала не прячется под панелью
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(300);
      const r = await page.evaluate(() => {
        const bar = document.querySelector('.bottom-bar').getBoundingClientRect();
        const blocks = [...document.querySelectorAll('main .md > *, main canvas')];
        const last = blocks[blocks.length - 1];
        return last ? { lastBottom: last.getBoundingClientRect().bottom, barTop: bar.top } : null;
      });
      ok(!!r && r.lastBottom <= r.barTop + 0.5, `Материал ${kind}: конец контента (${r && Math.round(r.lastBottom)}) выше панели (${r && Math.round(r.barTop)})`);
    }
    await study(page, sec);
  }

  await page.goto(courseUrl);
  await page.waitForTimeout(1200);
  const testBtn = page.getByRole('button', { name: /Пройти тест/ });
  ok(!(await testBtn.isDisabled()), 'Курс: тест открыт после изучения материалов');
  await testBtn.click();
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: /Начать тест/ }).click();
  await page.waitForTimeout(1000);
  await navHidden(page, 'Тест');
  const seen = new Set();
  for (let q = 0; q < 12 && seen.size < 4; q++) {
    const type = await page.locator('[data-qtype]').getAttribute('data-qtype');
    if (!seen.has(type)) {
      seen.add(type);
      await clickable(page, page.locator('.bottom-bar button').last(), `Тест (${type}): «Далее»`);
      await clickable(page, page.locator('.bottom-bar button').first(), `Тест (${type}): «Назад»`);
      await shot(page, devName, n++, `test-${type}`);
    }
    const next = page.locator('.bottom-bar button').last();
    if (/Завершить/.test(await next.innerText())) break;
    await next.click();
    await page.waitForTimeout(400);
  }
  ok(seen.size === 4, `Тест: проверены типы вопросов ${[...seen].join(', ')}`);

  await page.goto(`${BASE}/results`).catch(() => {});
  await page.waitForTimeout(1200);
  await contentClearsNav(page, 'Результаты');
  await shot(page, devName, n++, 'results');

  // --- передача по QR
  await page.goto(`${BASE}/qr-transfer`).catch(() => {});
  await page.waitForTimeout(1200);
  ok((await page.getByText('Сканировать подтверждение мастера').count()) === 0, 'QR: «Сканировать подтверждение» скрыто до показа кодов');
  await clickable(page, page.getByRole('button', { name: /Показать QR-коды/ }), 'QR: «Показать QR-коды»');
  await page.getByRole('button', { name: /Показать QR-коды/ }).click();
  await page.waitForSelector('img[alt^="QR "]', { timeout: 20000 });
  await page.waitForTimeout(500);
  await clickable(page, page.getByRole('button', { name: /Пауза|Продолжить/ }), 'QR: «Пауза»');
  await clickable(page, page.getByRole('button', { name: /Готово, мастер принял/ }), 'QR: «Готово, мастер принял»');
  await page.getByRole('button', { name: /Пауза/ }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, devName, n++, 'qr-transfer');

  // коды для приёмника: картинки карусели (для «загрузить фото») и текст («Скопировать код»)
  const total = Number((await page.getByText(/Код \d+ из \d+/).innerText()).match(/из (\d+)/)[1]);
  const images = [];
  for (let k = 0; k < total; k++) {
    const src = await page.locator('img[alt^="QR "]').getAttribute('src');
    const file = join(TMP, `${devName}-qr-${k + 1}.png`);
    writeFileSync(file, Buffer.from(src.split(',')[1], 'base64'));
    images.push(file);
    await page.getByRole('button', { name: 'Вперёд' }).click();
    await page.waitForTimeout(150);
  }
  await page.getByRole('button', { name: /Скопировать код/ }).click();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  ok(text.split('\n').length === total && text.startsWith('DPQR1|'), `QR: «Скопировать код» — ${total} строк DPQR1|…`);
  await browser.close();
  return { images, text, total };
}

async function desktop(qr) {
  console.log('\n=== ПК мастера (methodist, 1366×768, виртуальная камера) ===');
  const browser = await chromium.launch({
    executablePath, headless: true,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  await login(page, 'methodist');
  await clickable(page, page.locator('aside a', { hasText: 'Принять по QR' }), 'Меню методиста: «Принять по QR» виден без прокрутки');
  await page.locator('aside a', { hasText: 'Принять по QR' }).click();
  await page.waitForTimeout(1200);
  ok(await page.evaluate(() => !document.querySelector('video')?.srcObject), 'Камера не включается сама при открытии страницы');
  await page.getByRole('button', { name: 'Включить камеру' }).click();
  await page.waitForFunction(() => (document.querySelector('video')?.videoWidth || 0) > 0, null, { timeout: 15000 }).catch(() => {});
  ok(await page.evaluate(() => (document.querySelector('video')?.videoWidth || 0) > 0), 'По кнопке «Включить камеру» идёт видео');
  await page.screenshot({ path: join(SHOTS, 'desktop-01-qr-receive-camera.png') });

  await page.locator('input[type="file"]').setInputFiles(qr.images);
  await page.getByText(/Принято:|Пакет уже был принят/).waitFor({ timeout: 30000 });
  ok(await page.getByText(new RegExp(`Распознано кодов на фото: ${qr.total} из ${qr.total}`)).count() > 0, `Фото кодов: распознано ${qr.total} из ${qr.total}`);
  ok(await page.getByText(/^Принято:/).count() > 0, 'Пакет с фото принят сервером');
  await page.screenshot({ path: join(SHOTS, 'desktop-02-qr-received.png') });

  await page.getByRole('button', { name: /Новый приём/ }).click();
  await page.fill('#qr-manual', qr.text);
  await page.getByRole('button', { name: 'Добавить' }).click();
  await page.getByText(/Пакет уже был принят ранее/).waitFor({ timeout: 20000 });
  ok(true, 'Повтор того же пакета (ручной ввод) → «Пакет уже был принят ранее»');

  await page.getByRole('button', { name: /Демо: отправить изменённый пакет/ }).click();
  await page.getByText(/Подпись не совпала/).waitFor({ timeout: 20000 });
  ok(true, 'Подделанный пакет → «Подпись не совпала»');
  await page.screenshot({ path: join(SHOTS, 'desktop-03-qr-forged.png') });

  await page.goto(`${BASE}/reports`);
  await page.waitForTimeout(800);
  await browser.close();
}

if (!executablePath) {
  console.error('Не найден Chrome/Edge. Укажите путь в переменной CHROME.');
  process.exit(1);
}
const ONLY = process.env.ONLY || '';
const qrIphone = await phone('iphone14', devices['iPhone 14'], 'op18', 34);
await phone('pixel7', devices['Pixel 7'], 'op19', 0);
await desktop(qrIphone);
console.log(failures ? `\nПровалено проверок: ${failures}` : '\nВсе проверки пройдены');
process.exit(failures ? 1 : 0);

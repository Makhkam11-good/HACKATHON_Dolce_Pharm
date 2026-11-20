# Лицензии

Списки собраны автоматически 21.11.2026: npm — `npx license-checker@25.0.1 --json` в `frontend/`, Python — `pip-licenses --from=mixed` в контейнере `backend` (лицензии, которые pip-licenses не распознал, взяты из поля `License-Expression` метаданных пакета).

## Итог

- **Платных и проприетарных компонентов нет.** Все зависимости — свободные лицензии (MIT, ISC, BSD, Apache-2.0, MPL-2.0, LGPL, OFL, PSF и т. п.).
- **Копилефт** только у отдельных программ и библиотек, которые используются без изменения исходного кода: LibreOffice (MPL-2.0) и ffmpeg (GPL-2.0+) вызываются как отдельные процессы; psycopg (LGPL-3.0) — динамически подключаемая библиотека. Код приложения при этом не обязан открываться под этими лицензиями.
- **Данные синтетические**: пользователи, курсы, история и документы генерируются `backend/seed/`. Реальных персональных данных нет.
- **Внешние облака не используются**: всё работает на одном сервере в локальной сети, без CDN и внешних API. Cloudflare Tunnel — необязательный способ показать демо с телефона из любой сети.
- Логотип и фирменные цвета принадлежат Dolce Pharm и используются только в приложении для заказчика (источники — `docs/brand/source/SOURCES.md`).

## Программы, шрифты и Docker-образы

| Компонент | Версия | Лицензия | Как используется |
|---|---|---|---|
| LibreOffice (writer, calc, impress, без GUI) | 25.2.3 (Debian 13) | MPL-2.0 | конвертация Word/Excel/PowerPoint в PDF, отдельный процесс |
| FFmpeg | 7.1.5 (Debian 13, сборка с --enable-gpl) | GPL-2.0-or-later | сжатие видео до 720p, отдельный процесс |
| Шрифт Inter (@fontsource/inter) | 5.1.0 | OFL-1.1 | шрифт интерфейса, локально |
| Шрифты DejaVu (fonts-dejavu) | Debian 13 | Bitstream Vera / DejaVu (свободная) | кириллица в PDF сертификатов |
| Иконки (в стиле Feather / Lucide) | — | MIT / ISC | контуры иконок в `Icon.tsx` |
| Docker: postgres:16-alpine | 16 | PostgreSQL License | база данных |
| Docker: python:3.12-slim | 3.12 | PSF-2.0 (+ пакеты Debian) | сервер API |
| Docker: node:20-bookworm-slim | 20 | MIT | только сборка фронтенда |
| Docker: nginx:1.27-alpine | 1.27 | BSD-2-Clause | раздача приложения и HTTPS |
| Docker: cloudflare/cloudflared | latest | Apache-2.0 | необязательный туннель для демо |
| mkcert (на компьютере разработчика) | 1.4.x | BSD-3-Clause | локальные HTTPS-сертификаты |

## Python (41 пакетов в контейнере `backend`)

Прямые зависимости из `backend/requirements.txt` отмечены ✔.

| Пакет | Версия | Лицензия | Прямая |
|---|---|---|---|
| annotated-types | 0.8.0 | MIT License |  |
| anyio | 4.16.0 | MIT |  |
| bcrypt | 4.2.1 | Apache Software License | ✔ |
| certifi | 2026.10.23 | Mozilla Public License 2.0 (MPL 2.0) |  |
| chardet | 7.7.0 | 0BSD |  |
| click | 8.5.1 | BSD-3-Clause |  |
| et_xmlfile | 2.0.0 | MIT License |  |
| fastapi | 0.115.6 | MIT License | ✔ |
| greenlet | 3.5.6 | MIT AND PSF-2.0 |  |
| h11 | 0.16.0 | MIT License |  |
| httpcore | 1.0.9 | BSD License |  |
| httptools | 0.9.0 | MIT |  |
| httpx | 0.28.1 | BSD License | ✔ |
| idna | 3.20 | BSD-3-Clause |  |
| iniconfig | 2.3.1 | MIT |  |
| lxml | 6.1.3 | BSD-3-Clause |  |
| openpyxl | 3.1.5 | MIT License | ✔ |
| packaging | 26.3 | Apache-2.0 OR BSD-2-Clause |  |
| pillow | 13.0.0 | MIT-CMU |  |
| pluggy | 1.7.0 | MIT License |  |
| psycopg | 3.2.3 | GNU Lesser General Public License v3 (LGPLv3) | ✔ |
| psycopg-binary | 3.2.3 | GNU Lesser General Public License v3 (LGPLv3) |  |
| pydantic | 2.10.3 | MIT License | ✔ |
| pydantic_core | 2.27.1 | MIT License |  |
| PyJWT | 2.10.1 | MIT License | ✔ |
| pytest | 8.3.4 | MIT License | ✔ |
| python-docx | 1.1.2 | MIT License | ✔ |
| python-dotenv | 1.2.4 | BSD-3-Clause |  |
| python-multipart | 0.0.19 | Apache Software License | ✔ |
| python-pptx | 1.0.2 | MIT License | ✔ |
| PyYAML | 6.0.3 | MIT License |  |
| reportlab | 4.2.5 | BSD License | ✔ |
| SQLAlchemy | 2.0.36 | MIT License | ✔ |
| starlette | 0.41.3 | BSD License |  |
| typing_extensions | 4.16.0 | PSF-2.0 |  |
| tzdata | 2024.2 | Apache Software License | ✔ |
| uvicorn | 0.32.1 | BSD License | ✔ |
| uvloop | 0.23.0 | Apache Software License; MIT License |  |
| watchfiles | 1.3.0 | MIT License |  |
| websockets | 17.4 | BSD-3-Clause |  |
| xlsxwriter | 3.3.3 | BSD-2-Clause |  |

## npm (574 пакетов в `frontend/node_modules`, из них 243 попадают в приложение)

Сводка по лицензиям: MIT — 490, ISC — 36, Apache-2.0 — 17, BlueOak-1.0.0 — 9, BSD-3-Clause — 7, BSD-2-Clause — 4, (MIT AND Zlib) — 2, OFL-1.1 — 1, MPL-2.0 — 1, Unlicense — 1, Custom: http://github.com/substack/node-bufferlist — 1, CC-BY-4.0 — 1, MIT* — 1, (MIT OR GPL-3.0-or-later) — 1, 0BSD — 1, (MIT OR CC0-1.0) — 1.

«В приложении» — пакет из дерева `dependencies` (попадает в сборку); остальные — инструменты сборки и тестов. Прямые зависимости из `package.json` отмечены ✔.

| Пакет | Версия | Лицензия | В приложении | Прямая | Примечание |
|---|---|---|---|---|---|
| @alloc/quick-lru | 5.3.0 | MIT |  |  |  |
| @apideck/better-ajv-errors | 0.3.7 | MIT |  |  |  |
| @babel/code-frame | 7.29.7 | MIT |  |  |  |
| @babel/compat-data | 7.29.7 | MIT |  |  |  |
| @babel/core | 7.29.13 | MIT |  |  |  |
| @babel/generator | 7.29.14 | MIT |  |  |  |
| @babel/helper-annotate-as-pure | 7.29.7 | MIT |  |  |  |
| @babel/helper-compilation-targets | 7.29.13 | MIT |  |  |  |
| @babel/helper-create-class-features-plugin | 7.29.13 | MIT |  |  |  |
| @babel/helper-create-regexp-features-plugin | 7.29.14 | MIT |  |  |  |
| @babel/helper-define-polyfill-provider | 0.6.8 | MIT |  |  |  |
| @babel/helper-globals | 7.29.7 | MIT |  |  |  |
| @babel/helper-member-expression-to-functions | 7.29.14 | MIT |  |  |  |
| @babel/helper-module-imports | 7.29.7 | MIT |  |  |  |
| @babel/helper-module-transforms | 7.29.14 | MIT |  |  |  |
| @babel/helper-optimise-call-expression | 7.29.7 | MIT |  |  |  |
| @babel/helper-plugin-utils | 7.29.7 | MIT |  |  |  |
| @babel/helper-remap-async-to-generator | 7.29.7 | MIT |  |  |  |
| @babel/helper-replace-supers | 7.29.7 | MIT |  |  |  |
| @babel/helper-skip-transparent-expression-wrappers | 7.29.13 | MIT |  |  |  |
| @babel/helper-string-parser | 7.29.14 | MIT |  |  |  |
| @babel/helper-validator-identifier | 7.29.7 | MIT |  |  |  |
| @babel/helper-validator-option | 7.29.7 | MIT |  |  |  |
| @babel/helper-wrap-function | 7.29.14 | MIT |  |  |  |
| @babel/helpers | 7.29.14 | MIT |  |  |  |
| @babel/parser | 7.29.14 | MIT |  |  |  |
| @babel/plugin-bugfix-firefox-class-in-computed-class-key | 7.29.7 | MIT |  |  |  |
| @babel/plugin-bugfix-safari-class-field-initializer-scope | 7.29.7 | MIT |  |  |  |
| @babel/plugin-bugfix-safari-id-destructuring-collision-in-function-expression | 7.29.7 | MIT |  |  |  |
| @babel/plugin-bugfix-safari-rest-destructuring-rhs-array | 7.29.13 | MIT |  |  |  |
| @babel/plugin-bugfix-v8-spread-parameters-in-optional-chaining | 7.29.7 | MIT |  |  |  |
| @babel/plugin-bugfix-v8-static-class-fields-redefine-readonly | 7.29.7 | MIT |  |  |  |
| @babel/plugin-proposal-private-property-in-object | 7.21.0-placeholder-for-preset-env.2 | MIT |  |  |  |
| @babel/plugin-syntax-import-assertions | 7.29.7 | MIT |  |  |  |
| @babel/plugin-syntax-import-attributes | 7.29.7 | MIT |  |  |  |
| @babel/plugin-syntax-unicode-sets-regex | 7.18.6 | MIT |  |  |  |
| @babel/plugin-transform-arrow-functions | 7.29.7 | MIT |  |  |  |
| @babel/plugin-transform-async-generator-functions | 7.29.7 | MIT |  |  |  |
| @babel/plugin-transform-async-to-generator | 7.29.7 | MIT |  |  |  |
| @babel/plugin-transform-block-scoped-functions | 7.29.7 | MIT |  |  |  |
| @babel/plugin-transform-block-scoping | 7.29.13 | MIT |  |  |  |
| @babel/plugin-transform-class-properties | 7.29.7 | MIT |  |  |  |
| @babel/plugin-transform-class-static-block | 7.29.14 | MIT |  |  |  |
| @babel/plugin-transform-classes | 7.29.11 | MIT |  |  |  |
| @babel/plugin-transform-computed-properties | 7.29.7 | MIT |  |  |  |
| @babel/plugin-transform-destructuring | 7.29.13 | MIT |  |  |  |
| @babel/plugin-transform-dotall-regex | 7.29.7 | MIT |  |  |  |
| @babel/plugin-transform-duplicate-keys | 7.29.7 | MIT |  |  |  |
| @babel/plugin-transform-duplicate-named-capturing-groups-regex | 7.29.7 | MIT |  |  |  |
| @babel/plugin-transform-dynamic-import | 7.29.7 | MIT |  |  |  |
| @babel/plugin-transform-explicit-resource-management | 7.29.7 | MIT |  |  |  |
| @babel/plugin-transform-exponentiation-operator | 7.29.7 | MIT |  |  |  |
| @babel/plugin-transform-export-namespace-from | 7.29.7 | MIT |  |  |  |
| @babel/plugin-transform-for-of | 7.29.13 | MIT |  |  |  |
| @babel/plugin-transform-function-name | 7.29.7 | MIT |  |  |  |
| @babel/plugin-transform-json-strings | 7.29.7 | MIT |  |  |  |
| @babel/plugin-transform-literals | 7.29.7 | MIT |  |  |  |
| @babel/plugin-transform-logical-assignment-operators | 7.29.7 | MIT |  |  |  |
| @babel/plugin-transform-member-expression-literals | 7.29.7 | MIT |  |  |  |
| @babel/plugin-transform-modules-amd | 7.29.14 | MIT |  |  |  |
| @babel/plugin-transform-modules-commonjs | 7.29.14 | MIT |  |  |  |
| @babel/plugin-transform-modules-systemjs | 7.29.8 | MIT |  |  |  |
| @babel/plugin-transform-modules-umd | 7.29.14 | MIT |  |  |  |
| @babel/plugin-transform-named-capturing-groups-regex | 7.29.7 | MIT |  |  |  |
| @babel/plugin-transform-new-target | 7.29.7 | MIT |  |  |  |
| @babel/plugin-transform-nullish-coalescing-operator | 7.29.7 | MIT |  |  |  |
| @babel/plugin-transform-numeric-separator | 7.29.7 | MIT |  |  |  |
| @babel/plugin-transform-object-rest-spread | 7.29.7 | MIT |  |  |  |
| @babel/plugin-transform-object-super | 7.29.7 | MIT |  |  |  |
| @babel/plugin-transform-optional-catch-binding | 7.29.7 | MIT |  |  |  |
| @babel/plugin-transform-optional-chaining | 7.29.7 | MIT |  |  |  |
| @babel/plugin-transform-parameters | 7.29.7 | MIT |  |  |  |
| @babel/plugin-transform-private-methods | 7.29.7 | MIT |  |  |  |
| @babel/plugin-transform-private-property-in-object | 7.29.7 | MIT |  |  |  |
| @babel/plugin-transform-property-literals | 7.29.7 | MIT |  |  |  |
| @babel/plugin-transform-react-jsx-self | 7.29.7 | MIT |  |  |  |
| @babel/plugin-transform-react-jsx-source | 7.29.7 | MIT |  |  |  |
| @babel/plugin-transform-regenerator | 7.29.8 | MIT |  |  |  |
| @babel/plugin-transform-regexp-modifiers | 7.29.7 | MIT |  |  |  |
| @babel/plugin-transform-reserved-words | 7.29.7 | MIT |  |  |  |
| @babel/plugin-transform-shorthand-properties | 7.29.7 | MIT |  |  |  |
| @babel/plugin-transform-spread | 7.29.11 | MIT |  |  |  |
| @babel/plugin-transform-sticky-regex | 7.29.7 | MIT |  |  |  |
| @babel/plugin-transform-template-literals | 7.29.7 | MIT |  |  |  |
| @babel/plugin-transform-typeof-symbol | 7.29.7 | MIT |  |  |  |
| @babel/plugin-transform-unicode-escapes | 7.29.7 | MIT |  |  |  |
| @babel/plugin-transform-unicode-property-regex | 7.29.7 | MIT |  |  |  |
| @babel/plugin-transform-unicode-regex | 7.29.7 | MIT |  |  |  |
| @babel/plugin-transform-unicode-sets-regex | 7.29.7 | MIT |  |  |  |
| @babel/preset-env | 7.29.14 | MIT |  |  |  |
| @babel/preset-modules | 0.1.6-no-external-plugins | MIT |  |  |  |
| @babel/runtime | 7.29.14 | MIT | ✔ |  |  |
| @babel/template | 7.29.7 | MIT |  |  |  |
| @babel/traverse | 7.29.14 | MIT |  |  |  |
| @babel/types | 7.29.14 | MIT |  |  |  |
| @dnd-kit/accessibility | 3.1.1 | MIT | ✔ |  |  |
| @dnd-kit/core | 6.3.1 | MIT | ✔ | ✔ |  |
| @dnd-kit/sortable | 10.0.0 | MIT | ✔ | ✔ |  |
| @dnd-kit/utilities | 3.2.2 | MIT | ✔ | ✔ |  |
| @esbuild/win32-x64 | 0.21.5 | MIT |  |  |  |
| @esbuild/win32-x64 | 0.25.12 | MIT |  |  |  |
| @fast-csv/format | 4.3.5 | MIT | ✔ |  |  |
| @fast-csv/parse | 4.3.6 | MIT | ✔ |  |  |
| @fontsource/inter | 5.1.0 | OFL-1.1 | ✔ | ✔ | шрифт Inter |
| @isaacs/cliui | 9.0.0 | BlueOak-1.0.0 |  |  |  |
| @jridgewell/gen-mapping | 0.3.13 | MIT |  |  |  |
| @jridgewell/remapping | 2.3.5 | MIT |  |  |  |
| @jridgewell/resolve-uri | 3.1.3 | MIT |  |  |  |
| @jridgewell/source-map | 0.3.11 | MIT |  |  |  |
| @jridgewell/sourcemap-codec | 1.6.0 | MIT |  |  |  |
| @jridgewell/trace-mapping | 0.3.31 | MIT |  |  |  |
| @kurkle/color | 0.3.4 | MIT | ✔ |  |  |
| @napi-rs/canvas-win32-x64-msvc | 0.1.100 | MIT | ✔ |  |  |
| @napi-rs/canvas | 0.1.100 | MIT | ✔ |  |  |
| @nodelib/fs.scandir | 2.1.5 | MIT |  |  |  |
| @nodelib/fs.stat | 2.0.5 | MIT |  |  |  |
| @nodelib/fs.walk | 1.2.8 | MIT |  |  |  |
| @remix-run/router | 1.23.4 | MIT | ✔ |  |  |
| @rolldown/pluginutils | 1.0.0-beta.27 | MIT |  |  |  |
| @rollup/plugin-babel | 6.1.0 | MIT |  |  |  |
| @rollup/plugin-node-resolve | 16.0.3 | MIT |  |  |  |
| @rollup/plugin-replace | 6.0.3 | MIT |  |  |  |
| @rollup/plugin-terser | 1.0.2 | MIT |  |  |  |
| @rollup/pluginutils | 5.5.1 | MIT |  |  |  |
| @rollup/rollup-win32-x64-gnu | 4.68.7 | MIT |  |  |  |
| @rollup/rollup-win32-x64-msvc | 4.68.7 | MIT |  |  |  |
| @trickfilm400/rollup-plugin-off-main-thread | 3.0.0-pre1 | Apache-2.0 |  |  |  |
| @types/babel__core | 7.20.5 | MIT |  |  |  |
| @types/babel__generator | 7.27.0 | MIT |  |  |  |
| @types/babel__template | 7.4.4 | MIT |  |  |  |
| @types/babel__traverse | 7.28.0 | MIT |  |  |  |
| @types/estree | 1.0.10 | MIT |  |  |  |
| @types/node | 14.18.63 | MIT | ✔ | ✔ |  |
| @types/node | 22.20.5 | MIT |  | ✔ |  |
| @types/pako | 2.0.4 | MIT |  | ✔ |  |
| @types/prop-types | 15.7.15 | MIT | ✔ |  |  |
| @types/qrcode | 1.5.6 | MIT |  | ✔ |  |
| @types/react-dom | 18.3.7 | MIT |  | ✔ |  |
| @types/react | 18.3.31 | MIT | ✔ | ✔ |  |
| @types/resolve | 1.20.2 | MIT |  |  |  |
| @types/trusted-types | 2.0.7 | MIT |  |  |  |
| @vitejs/plugin-react | 4.7.0 | MIT |  | ✔ |  |
| @vitest/expect | 2.1.9 | MIT |  |  |  |
| @vitest/mocker | 2.1.9 | MIT |  |  |  |
| @vitest/pretty-format | 2.1.9 | MIT |  |  |  |
| @vitest/runner | 2.1.9 | MIT |  |  |  |
| @vitest/snapshot | 2.1.9 | MIT |  |  |  |
| @vitest/spy | 2.1.9 | MIT |  |  |  |
| @vitest/utils | 2.1.9 | MIT |  |  |  |
| acorn | 8.19.0 | MIT |  |  |  |
| ajv | 8.20.0 | MIT |  |  |  |
| ansi-regex | 5.0.1 | MIT | ✔ |  |  |
| ansi-styles | 4.3.0 | MIT | ✔ |  |  |
| any-promise | 1.3.0 | MIT |  |  |  |
| anymatch | 3.1.3 | ISC |  |  |  |
| archiver-utils | 2.1.0 | MIT | ✔ |  |  |
| archiver-utils | 3.0.4 | MIT | ✔ |  |  |
| archiver | 5.3.2 | MIT | ✔ |  |  |
| arg | 5.0.2 | MIT |  |  |  |
| array-buffer-byte-length | 1.0.2 | MIT | ✔ |  |  |
| arraybuffer.prototype.slice | 1.0.4 | MIT | ✔ |  |  |
| assertion-error | 2.0.1 | MIT |  |  |  |
| async-function | 1.0.0 | MIT | ✔ |  |  |
| async | 3.2.6 | MIT | ✔ |  |  |
| at-least-node | 1.0.0 | ISC |  |  |  |
| autoprefixer | 10.7.0 | MIT |  | ✔ |  |
| available-typed-arrays | 1.0.7 | MIT | ✔ |  |  |
| axe-core | 4.10.2 | MPL-2.0 |  |  | только для автотестов, не входит в приложение и package.json |
| babel-plugin-polyfill-corejs2 | 0.4.17 | MIT |  |  |  |
| babel-plugin-polyfill-corejs3 | 0.14.2 | MIT |  |  |  |
| babel-plugin-polyfill-regenerator | 0.6.8 | MIT |  |  |  |
| balanced-match | 1.0.2 | MIT | ✔ |  |  |
| balanced-match | 4.0.4 | MIT |  |  |  |
| base64-js | 1.5.1 | MIT | ✔ |  |  |
| baseline-browser-mapping | 2.11.39 | Apache-2.0 |  |  |  |
| big-integer | 1.6.52 | Unlicense | ✔ |  |  |
| binary-extensions | 2.3.0 | MIT |  |  |  |
| binary | 0.3.0 | MIT | ✔ |  |  |
| bl | 4.1.0 | MIT | ✔ |  |  |
| bluebird | 3.4.7 | MIT | ✔ |  |  |
| brace-expansion | 1.1.22 | MIT | ✔ |  |  |
| brace-expansion | 2.1.8 | MIT | ✔ |  |  |
| brace-expansion | 5.0.13 | MIT |  |  |  |
| braces | 3.0.3 | MIT |  |  |  |
| browserslist | 4.29.6 | MIT |  |  |  |
| buffer-crc32 | 0.2.13 | MIT | ✔ |  |  |
| buffer-from | 1.1.2 | MIT |  |  |  |
| buffer-indexof-polyfill | 1.0.2 | MIT | ✔ |  |  |
| buffer | 5.7.1 | MIT | ✔ |  |  |
| buffers | 0.1.1 | Custom: http://github.com/substack/node-bufferlist | ✔ |  | MIT/X11 (указано в README пакета) |
| cac | 6.7.14 | MIT |  |  |  |
| call-bind-apply-helpers | 1.0.2 | MIT | ✔ |  |  |
| call-bind | 1.0.9 | MIT | ✔ |  |  |
| call-bound | 1.0.4 | MIT | ✔ |  |  |
| camelcase-css | 2.0.1 | MIT |  |  |  |
| camelcase | 5.3.1 | MIT | ✔ |  |  |
| caniuse-lite | 1.0.30001826 | CC-BY-4.0 |  |  | данные для сборки, в приложение не попадают |
| chai | 5.3.3 | MIT |  |  |  |
| chainsaw | 0.1.0 | MIT* | ✔ |  | MIT (указано в README пакета) |
| chart.js | 4.6.1 | MIT | ✔ | ✔ |  |
| check-error | 2.1.3 | MIT |  |  |  |
| chokidar | 3.6.0 | MIT |  |  |  |
| cliui | 6.0.0 | ISC | ✔ |  |  |
| color-convert | 2.0.1 | MIT | ✔ |  |  |
| color-name | 1.1.4 | MIT | ✔ |  |  |
| commander | 2.20.3 | MIT |  |  |  |
| commander | 4.1.1 | MIT |  |  |  |
| common-tags | 1.8.2 | MIT |  |  |  |
| compress-commons | 4.1.2 | MIT | ✔ |  |  |
| concat-map | 0.0.1 | MIT | ✔ |  |  |
| convert-source-map | 2.0.0 | MIT |  |  |  |
| core-js-compat | 3.51.0 | MIT |  |  |  |
| core-util-is | 1.0.3 | MIT | ✔ |  |  |
| crc-32 | 1.2.2 | Apache-2.0 | ✔ |  |  |
| crc32-stream | 4.0.3 | MIT | ✔ |  |  |
| cross-spawn | 7.0.6 | MIT |  |  |  |
| crypto-random-string | 2.0.0 | MIT |  |  |  |
| csstype | 3.2.4 | MIT | ✔ |  |  |
| data-view-buffer | 1.0.2 | MIT | ✔ |  |  |
| data-view-byte-length | 1.0.2 | MIT | ✔ |  |  |
| data-view-byte-offset | 1.0.1 | MIT | ✔ |  |  |
| dayjs | 1.11.23 | MIT | ✔ |  |  |
| debug | 4.4.3 | MIT |  |  |  |
| decamelize | 1.2.0 | MIT | ✔ |  |  |
| deep-eql | 5.0.2 | MIT |  |  |  |
| deepmerge | 4.3.1 | MIT |  |  |  |
| define-data-property | 1.1.4 | MIT | ✔ |  |  |
| define-properties | 1.2.1 | MIT | ✔ |  |  |
| dexie-react-hooks | 1.1.7 | Apache-2.0 | ✔ | ✔ |  |
| dexie | 4.4.7 | Apache-2.0 | ✔ | ✔ |  |
| didyoumean | 1.2.2 | Apache-2.0 |  |  |  |
| dijkstrajs | 1.0.3 | MIT | ✔ |  |  |
| dlv | 1.1.3 | MIT |  |  |  |
| dunder-proto | 1.0.1 | MIT | ✔ |  |  |
| duplexer2 | 0.1.4 | BSD-3-Clause | ✔ |  |  |
| ejs | 3.1.10 | Apache-2.0 |  |  |  |
| electron-to-chromium | 1.5.492 | ISC |  |  |  |
| emoji-regex | 8.0.0 | MIT | ✔ |  |  |
| end-of-stream | 1.4.5 | MIT | ✔ |  |  |
| es-abstract-get | 1.0.0 | MIT | ✔ |  |  |
| es-abstract | 1.24.2 | MIT | ✔ |  |  |
| es-define-property | 1.0.1 | MIT | ✔ |  |  |
| es-errors | 1.3.0 | MIT | ✔ |  |  |
| es-module-lexer | 1.7.0 | MIT |  |  |  |
| es-object-atoms | 1.1.2 | MIT | ✔ |  |  |
| es-set-tostringtag | 2.1.0 | MIT | ✔ |  |  |
| es-to-primitive | 1.3.4 | MIT | ✔ |  |  |
| esbuild | 0.21.5 | MIT |  |  |  |
| esbuild | 0.25.12 | MIT |  |  |  |
| escalade | 3.2.0 | MIT |  |  |  |
| estree-walker | 2.0.2 | MIT |  |  |  |
| estree-walker | 3.0.3 | MIT |  |  |  |
| esutils | 2.0.3 | BSD-2-Clause |  |  |  |
| eta | 4.6.0 | MIT |  |  |  |
| exceljs | 4.4.0 | MIT | ✔ | ✔ |  |
| expect-type | 1.4.0 | Apache-2.0 |  |  |  |
| fast-csv | 4.3.6 | MIT | ✔ |  |  |
| fast-deep-equal | 3.1.3 | MIT |  |  |  |
| fast-glob | 3.3.3 | MIT |  |  |  |
| fast-json-stable-stringify | 2.1.0 | MIT |  |  |  |
| fast-uri | 3.1.9 | BSD-3-Clause |  |  |  |
| fastq | 1.20.3 | ISC |  |  |  |
| fdir | 6.5.0 | MIT |  |  |  |
| filelist | 1.0.6 | Apache-2.0 |  |  |  |
| fill-range | 7.1.1 | MIT |  |  |  |
| find-up | 4.1.0 | MIT | ✔ |  |  |
| for-each | 0.3.5 | MIT | ✔ |  |  |
| foreground-child | 3.3.1 | ISC |  |  |  |
| fraction.js | 5.3.4 | MIT |  |  |  |
| fs-constants | 1.0.0 | MIT | ✔ |  |  |
| fs-extra | 9.1.0 | MIT |  |  |  |
| fs.realpath | 1.0.0 | ISC | ✔ |  |  |
| fstream | 1.0.12 | ISC | ✔ |  |  |
| function-bind | 1.1.2 | MIT | ✔ |  |  |
| function.prototype.name | 1.2.0 | MIT | ✔ |  |  |
| functions-have-names | 1.2.3 | MIT | ✔ |  |  |
| fuse.js | 7.5.0 | Apache-2.0 | ✔ | ✔ |  |
| generator-function | 2.0.1 | MIT | ✔ |  |  |
| gensync | 1.0.0-beta.2 | MIT |  |  |  |
| get-caller-file | 2.0.5 | ISC | ✔ |  |  |
| get-intrinsic | 1.3.0 | MIT | ✔ |  |  |
| get-own-enumerable-property-symbols | 3.0.2 | ISC |  |  |  |
| get-proto | 1.0.1 | MIT | ✔ |  |  |
| get-symbol-description | 1.1.0 | MIT | ✔ |  |  |
| glob-parent | 5.1.2 | ISC |  |  |  |
| glob-parent | 6.0.2 | ISC |  |  |  |
| glob | 11.1.0 | BlueOak-1.0.0 |  |  |  |
| glob | 7.2.3 | ISC | ✔ |  |  |
| globalthis | 1.0.4 | MIT | ✔ |  |  |
| gopd | 1.2.0 | MIT | ✔ |  |  |
| graceful-fs | 4.2.12 | BlueOak-1.0.0 | ✔ |  |  |
| has-bigints | 1.1.0 | MIT | ✔ |  |  |
| has-property-descriptors | 1.0.2 | MIT | ✔ |  |  |
| has-proto | 1.2.0 | MIT | ✔ |  |  |
| has-symbols | 1.1.0 | MIT | ✔ |  |  |
| has-tostringtag | 1.0.2 | MIT | ✔ |  |  |
| hasown | 2.0.4 | MIT | ✔ |  |  |
| html-parse-stringify | 3.1.0 | MIT | ✔ |  |  |
| i18next | 24.2.3 | MIT | ✔ | ✔ |  |
| idb | 7.1.1 | ISC |  |  |  |
| ieee754 | 1.2.1 | BSD-3-Clause | ✔ |  |  |
| immediate | 3.0.6 | MIT | ✔ |  |  |
| inflight | 1.0.6 | ISC | ✔ |  |  |
| inherits | 2.0.4 | ISC | ✔ |  |  |
| internal-slot | 1.1.0 | MIT | ✔ |  |  |
| is-array-buffer | 3.0.5 | MIT | ✔ |  |  |
| is-async-function | 2.1.1 | MIT | ✔ |  |  |
| is-bigint | 1.1.0 | MIT | ✔ |  |  |
| is-binary-path | 2.1.0 | MIT |  |  |  |
| is-boolean-object | 1.2.2 | MIT | ✔ |  |  |
| is-callable | 1.2.7 | MIT | ✔ |  |  |
| is-core-module | 2.18.0 | MIT |  |  |  |
| is-data-view | 1.0.2 | MIT | ✔ |  |  |
| is-date-object | 1.1.0 | MIT | ✔ |  |  |
| is-document.all | 1.0.0 | MIT | ✔ |  |  |
| is-extglob | 2.1.1 | MIT |  |  |  |
| is-finalizationregistry | 1.1.1 | MIT | ✔ |  |  |
| is-fullwidth-code-point | 3.0.0 | MIT | ✔ |  |  |
| is-generator-function | 1.1.2 | MIT | ✔ |  |  |
| is-glob | 4.0.3 | MIT |  |  |  |
| is-map | 2.0.3 | MIT | ✔ |  |  |
| is-module | 1.0.0 | MIT |  |  |  |
| is-negative-zero | 2.0.3 | MIT | ✔ |  |  |
| is-number-object | 1.1.1 | MIT | ✔ |  |  |
| is-number | 7.0.0 | MIT |  |  |  |
| is-obj | 1.0.1 | MIT |  |  |  |
| is-regex | 1.2.1 | MIT | ✔ |  |  |
| is-regexp | 1.0.0 | MIT |  |  |  |
| is-set | 2.0.3 | MIT | ✔ |  |  |
| is-shared-array-buffer | 1.0.4 | MIT | ✔ |  |  |
| is-stream | 2.0.1 | MIT |  |  |  |
| is-string | 1.1.1 | MIT | ✔ |  |  |
| is-symbol | 1.1.1 | MIT | ✔ |  |  |
| is-typed-array | 1.1.15 | MIT | ✔ |  |  |
| is-weakmap | 2.0.2 | MIT | ✔ |  |  |
| is-weakref | 1.1.1 | MIT | ✔ |  |  |
| is-weakset | 2.0.4 | MIT | ✔ |  |  |
| isarray | 1.0.0 | MIT | ✔ |  |  |
| isarray | 2.0.5 | MIT | ✔ |  |  |
| isexe | 2.0.0 | ISC |  |  |  |
| jackspeak | 4.2.3 | BlueOak-1.0.0 |  |  |  |
| jake | 10.9.4 | Apache-2.0 |  |  |  |
| jiti | 1.21.7 | MIT |  |  |  |
| js-tokens | 4.0.0 | MIT | ✔ |  |  |
| jsesc | 3.1.0 | MIT |  |  |  |
| json-schema-traverse | 1.0.0 | MIT |  |  |  |
| json5 | 2.2.3 | MIT |  |  |  |
| jsonfile | 6.2.1 | MIT |  |  |  |
| jsonpointer | 5.0.1 | MIT |  |  |  |
| jsqr | 1.4.0 | Apache-2.0 | ✔ | ✔ |  |
| jszip | 3.10.2 | (MIT OR GPL-3.0-or-later) | ✔ |  | двойная лицензия — используем по MIT |
| lazystream | 1.0.1 | MIT | ✔ |  |  |
| leven | 3.1.0 | MIT |  |  |  |
| lie | 3.3.0 | MIT | ✔ |  |  |
| lilconfig | 3.1.5 | MIT |  |  |  |
| lines-and-columns | 1.2.4 | MIT |  |  |  |
| listenercount | 1.0.1 | ISC | ✔ |  |  |
| locate-path | 5.0.0 | MIT | ✔ |  |  |
| lodash.debounce | 4.0.8 | MIT |  |  |  |
| lodash.defaults | 4.2.0 | MIT | ✔ |  |  |
| lodash.difference | 4.5.0 | MIT | ✔ |  |  |
| lodash.escaperegexp | 4.1.2 | MIT | ✔ |  |  |
| lodash.flatten | 4.4.0 | MIT | ✔ |  |  |
| lodash.groupby | 4.6.0 | MIT | ✔ |  |  |
| lodash.isboolean | 3.0.3 | MIT | ✔ |  |  |
| lodash.isequal | 4.5.0 | MIT | ✔ |  |  |
| lodash.isfunction | 3.0.9 | MIT | ✔ |  |  |
| lodash.isnil | 4.0.0 | MIT | ✔ |  |  |
| lodash.isplainobject | 4.0.6 | MIT | ✔ |  |  |
| lodash.isundefined | 3.0.1 | MIT | ✔ |  |  |
| lodash.union | 4.6.0 | MIT | ✔ |  |  |
| lodash.uniq | 4.5.0 | MIT | ✔ |  |  |
| loose-envify | 1.4.0 | MIT | ✔ |  |  |
| loupe | 3.2.1 | MIT |  |  |  |
| lru-cache | 11.5.3 | BlueOak-1.0.0 |  |  |  |
| lru-cache | 5.1.1 | ISC |  |  |  |
| magic-string | 0.30.21 | MIT |  |  |  |
| math-intrinsics | 1.1.0 | MIT | ✔ |  |  |
| merge2 | 1.4.1 | MIT |  |  |  |
| micromatch | 4.0.8 | MIT |  |  |  |
| minimatch | 10.2.6 | BlueOak-1.0.0 |  |  |  |
| minimatch | 3.1.5 | ISC | ✔ |  |  |
| minimatch | 5.1.9 | ISC | ✔ |  |  |
| minimist | 1.2.8 | MIT | ✔ |  |  |
| minipass | 7.1.3 | BlueOak-1.0.0 |  |  |  |
| mkdirp | 0.5.6 | MIT | ✔ |  |  |
| ms | 2.1.3 | MIT |  |  |  |
| mz | 2.7.0 | MIT |  |  |  |
| nanoid | 3.3.20 | MIT |  |  |  |
| node-releases | 2.0.65 | MIT |  |  |  |
| normalize-path | 3.0.0 | MIT | ✔ |  |  |
| object-assign | 4.1.1 | MIT |  |  |  |
| object-hash | 3.0.0 | MIT |  |  |  |
| object-inspect | 1.14.0 | MIT | ✔ |  |  |
| object-keys | 1.1.1 | MIT | ✔ |  |  |
| object.assign | 4.1.7 | MIT | ✔ |  |  |
| once | 1.4.0 | ISC | ✔ |  |  |
| own-keys | 1.0.2 | MIT | ✔ |  |  |
| p-limit | 2.3.0 | MIT | ✔ |  |  |
| p-locate | 4.1.0 | MIT | ✔ |  |  |
| p-try | 2.2.0 | MIT | ✔ |  |  |
| package-json-from-dist | 1.0.1 | BlueOak-1.0.0 |  |  |  |
| pako | 1.0.11 | (MIT AND Zlib) | ✔ | ✔ |  |
| pako | 2.2.0 | (MIT AND Zlib) | ✔ | ✔ |  |
| path-exists | 4.0.0 | MIT | ✔ |  |  |
| path-is-absolute | 1.0.1 | MIT | ✔ |  |  |
| path-key | 3.1.1 | MIT |  |  |  |
| path-parse | 1.0.7 | MIT |  |  |  |
| path-scurry | 2.0.2 | BlueOak-1.0.0 |  |  |  |
| pathe | 1.1.2 | MIT |  |  |  |
| pathval | 2.0.1 | MIT |  |  |  |
| pdfjs-dist | 4.10.38 | Apache-2.0 | ✔ | ✔ |  |
| picocolors | 1.1.1 | ISC |  |  |  |
| picomatch | 2.3.2 | MIT |  |  |  |
| picomatch | 4.0.7 | MIT |  |  |  |
| pirates | 4.0.7 | MIT |  |  |  |
| playwright-core | 1.48.2 | Apache-2.0 |  |  | только для автотестов, не входит в приложение и package.json |
| pngjs | 5.0.0 | MIT | ✔ |  |  |
| possible-typed-array-names | 1.1.0 | MIT | ✔ |  |  |
| postcss-import | 15.1.0 | MIT |  |  |  |
| postcss-js | 4.1.0 | MIT |  |  |  |
| postcss-load-config | 6.0.1 | MIT |  |  |  |
| postcss-nested | 6.2.0 | MIT |  |  |  |
| postcss-selector-parser | 6.1.6 | MIT |  |  |  |
| postcss-value-parser | 4.2.0 | MIT |  |  |  |
| postcss | 8.5.33 | MIT |  | ✔ |  |
| pretty-bytes | 5.6.0 | MIT |  |  |  |
| pretty-bytes | 6.1.1 | MIT |  |  |  |
| process-nextick-args | 2.0.1 | MIT | ✔ |  |  |
| qrcode | 1.5.4 | MIT | ✔ | ✔ |  |
| queue-microtask | 1.2.3 | MIT |  |  |  |
| react-dom | 18.3.1 | MIT | ✔ | ✔ |  |
| react-i18next | 15.7.4 | MIT | ✔ | ✔ |  |
| react-refresh | 0.17.0 | MIT |  |  |  |
| react-router-dom | 6.30.6 | MIT | ✔ | ✔ |  |
| react-router | 6.30.6 | MIT | ✔ |  |  |
| react | 18.3.1 | MIT | ✔ | ✔ |  |
| read-cache | 1.0.2 | MIT |  |  |  |
| readable-stream | 2.3.8 | MIT | ✔ |  |  |
| readable-stream | 3.6.2 | MIT | ✔ |  |  |
| readdir-glob | 1.1.3 | Apache-2.0 | ✔ |  |  |
| readdirp | 3.6.0 | MIT |  |  |  |
| reflect.getprototypeof | 1.0.10 | MIT | ✔ |  |  |
| regenerate-unicode-properties | 10.3.0 | MIT |  |  |  |
| regenerate | 1.5.0 | MIT |  |  |  |
| regexp.prototype.flags | 1.5.4 | MIT | ✔ |  |  |
| regexpu-core | 6.5.4 | MIT |  |  |  |
| regjsgen | 0.8.0 | MIT |  |  |  |
| regjsparser | 0.14.1 | BSD-2-Clause |  |  |  |
| require-directory | 2.1.1 | MIT | ✔ |  |  |
| require-from-string | 2.0.2 | MIT |  |  |  |
| require-main-filename | 2.0.0 | ISC | ✔ |  |  |
| resolve | 1.22.14 | MIT |  |  |  |
| reusify | 1.1.0 | MIT |  |  |  |
| rimraf | 2.7.1 | ISC | ✔ |  |  |
| rollup | 4.68.7 | MIT |  |  |  |
| run-parallel | 1.2.0 | MIT |  |  |  |
| safe-array-concat | 1.1.4 | MIT | ✔ |  |  |
| safe-buffer | 5.1.2 | MIT | ✔ |  |  |
| safe-buffer | 5.2.1 | MIT | ✔ |  |  |
| safe-push-apply | 1.0.0 | MIT | ✔ |  |  |
| safe-regex-test | 1.1.0 | MIT | ✔ |  |  |
| saxes | 5.0.1 | ISC | ✔ |  |  |
| scheduler | 0.23.2 | MIT | ✔ |  |  |
| semver | 6.3.2 | ISC |  |  |  |
| serialize-javascript | 7.1.4 | BSD-3-Clause |  |  |  |
| set-blocking | 2.0.0 | ISC | ✔ |  |  |
| set-function-length | 1.2.2 | MIT | ✔ |  |  |
| set-function-name | 2.0.2 | MIT | ✔ |  |  |
| set-proto | 1.0.0 | MIT | ✔ |  |  |
| setimmediate | 1.0.5 | MIT | ✔ |  |  |
| shebang-command | 2.0.0 | MIT |  |  |  |
| shebang-regex | 3.0.0 | MIT |  |  |  |
| side-channel-list | 1.0.1 | MIT | ✔ |  |  |
| side-channel-map | 1.0.1 | MIT | ✔ |  |  |
| side-channel-weakmap | 1.0.2 | MIT | ✔ |  |  |
| side-channel | 1.1.1 | MIT | ✔ |  |  |
| siginfo | 2.0.0 | ISC |  |  |  |
| signal-exit | 4.1.0 | ISC |  |  |  |
| smob | 1.6.2 | MIT |  |  |  |
| source-map-js | 1.2.4 | BSD-3-Clause |  |  |  |
| source-map-support | 0.5.21 | MIT |  |  |  |
| source-map | 0.6.1 | BSD-3-Clause |  |  |  |
| source-map | 0.8.0 | BSD-3-Clause |  |  |  |
| stackback | 0.0.2 | MIT |  |  |  |
| std-env | 3.10.0 | MIT |  |  |  |
| stop-iteration-iterator | 1.1.0 | MIT | ✔ |  |  |
| string-width | 4.2.3 | MIT | ✔ |  |  |
| string.prototype.matchall | 4.1.0 | MIT |  |  |  |
| string.prototype.trim | 1.2.11 | MIT | ✔ |  |  |
| string.prototype.trimend | 1.0.10 | MIT | ✔ |  |  |
| string.prototype.trimstart | 1.0.8 | MIT | ✔ |  |  |
| string_decoder | 1.1.1 | MIT | ✔ |  |  |
| string_decoder | 1.3.0 | MIT | ✔ |  |  |
| stringify-object | 3.3.0 | BSD-2-Clause |  |  |  |
| strip-ansi | 6.0.1 | MIT | ✔ |  |  |
| strip-comments | 2.0.1 | MIT |  |  |  |
| sucrase | 3.35.1 | MIT |  |  |  |
| supports-preserve-symlinks-flag | 1.0.0 | MIT |  |  |  |
| tailwindcss | 3.4.19 | MIT |  | ✔ |  |
| tar-stream | 2.2.0 | MIT | ✔ |  |  |
| temp-dir | 2.0.0 | MIT |  |  |  |
| tempy | 0.6.0 | MIT |  |  |  |
| terser | 5.51.3 | BSD-2-Clause |  |  |  |
| thenify-all | 1.6.0 | MIT |  |  |  |
| thenify | 3.3.1 | MIT |  |  |  |
| tinybench | 2.9.0 | MIT |  |  |  |
| tinyexec | 0.3.2 | MIT |  |  |  |
| tinyglobby | 0.2.17 | MIT |  |  |  |
| tinypool | 1.1.1 | MIT |  |  |  |
| tinyrainbow | 1.2.0 | MIT |  |  |  |
| tinyspy | 3.0.2 | MIT |  |  |  |
| tmp | 0.2.7 | MIT | ✔ |  |  |
| to-regex-range | 5.0.1 | MIT |  |  |  |
| traverse | 0.3.10 | MIT | ✔ |  |  |
| ts-interface-checker | 0.1.13 | Apache-2.0 |  |  |  |
| tslib | 2.9.1 | 0BSD | ✔ |  |  |
| type-fest | 0.16.0 | (MIT OR CC0-1.0) |  |  |  |
| typed-array-buffer | 1.0.3 | MIT | ✔ |  |  |
| typed-array-byte-length | 1.0.3 | MIT | ✔ |  |  |
| typed-array-byte-offset | 1.0.5 | MIT | ✔ |  |  |
| typed-array-length | 1.0.8 | MIT | ✔ |  |  |
| typedarray.prototype.slice | 1.0.6 | MIT | ✔ |  |  |
| typescript | 5.7.3 | Apache-2.0 | ✔ | ✔ |  |
| unbox-primitive | 1.1.0 | MIT | ✔ |  |  |
| undici-types | 6.21.0 | MIT |  |  |  |
| unicode-canonical-property-names-ecmascript | 2.0.1 | MIT |  |  |  |
| unicode-match-property-ecmascript | 2.0.0 | MIT |  |  |  |
| unicode-match-property-value-ecmascript | 2.2.1 | MIT |  |  |  |
| unicode-property-aliases-ecmascript | 2.2.0 | MIT |  |  |  |
| unique-string | 2.0.0 | MIT |  |  |  |
| universalify | 2.0.1 | MIT |  |  |  |
| unzipper | 0.10.14 | MIT | ✔ |  |  |
| upath | 1.2.0 | MIT |  |  |  |
| update-browserslist-db | 1.4.0 | MIT |  |  |  |
| util-deprecate | 1.0.2 | MIT | ✔ |  |  |
| uuid | 8.3.2 | MIT | ✔ |  |  |
| vite-node | 2.1.9 | MIT |  |  |  |
| vite-plugin-pwa | 0.21.2 | MIT |  | ✔ |  |
| vite | 5.4.21 | MIT |  | ✔ |  |
| vite | 6.4.6 | MIT |  | ✔ |  |
| vitest | 2.1.9 | MIT |  | ✔ |  |
| void-elements | 3.1.0 | MIT | ✔ |  |  |
| which-boxed-primitive | 1.1.1 | MIT | ✔ |  |  |
| which-builtin-type | 1.2.1 | MIT | ✔ |  |  |
| which-collection | 1.0.2 | MIT | ✔ |  |  |
| which-module | 2.0.1 | ISC | ✔ |  |  |
| which-typed-array | 1.1.24 | MIT | ✔ |  |  |
| which | 2.0.2 | ISC |  |  |  |
| why-is-node-running | 2.3.0 | MIT |  |  |  |
| workbox-background-sync | 7.4.1 | MIT |  |  |  |
| workbox-broadcast-update | 7.4.1 | MIT |  |  |  |
| workbox-build | 7.4.1 | MIT |  |  |  |
| workbox-cacheable-response | 7.4.1 | MIT |  |  |  |
| workbox-core | 7.4.1 | MIT | ✔ | ✔ |  |
| workbox-expiration | 7.4.1 | MIT |  |  |  |
| workbox-google-analytics | 7.4.1 | MIT |  |  |  |
| workbox-navigation-preload | 7.4.1 | MIT |  |  |  |
| workbox-precaching | 7.4.1 | MIT | ✔ | ✔ |  |
| workbox-range-requests | 7.4.1 | MIT |  |  |  |
| workbox-recipes | 7.4.1 | MIT |  |  |  |
| workbox-routing | 7.4.1 | MIT | ✔ | ✔ |  |
| workbox-strategies | 7.4.1 | MIT | ✔ |  |  |
| workbox-streams | 7.4.1 | MIT |  |  |  |
| workbox-sw | 7.4.1 | MIT |  |  |  |
| workbox-window | 7.4.1 | MIT |  |  |  |
| wrap-ansi | 6.2.0 | MIT | ✔ |  |  |
| wrappy | 1.0.2 | ISC | ✔ |  |  |
| xmlchars | 2.2.0 | MIT | ✔ |  |  |
| y18n | 4.0.3 | ISC | ✔ |  |  |
| yallist | 3.1.1 | ISC |  |  |  |
| yargs-parser | 18.1.3 | ISC | ✔ |  |  |
| yargs | 15.4.1 | MIT | ✔ |  |  |
| zip-stream | 4.1.1 | MIT | ✔ |  |  |

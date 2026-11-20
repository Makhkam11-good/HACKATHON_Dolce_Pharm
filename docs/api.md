# REST API

Полная интерактивная документация генерируется автоматически: **`https://<host>/api/docs`** (Swagger UI), схема — `/api/openapi.json`.

- Префикс `/api`, формат JSON, авторизация `Authorization: Bearer <JWT>` (токен живёт 7 дней).
- Ошибки: `{"detail": {"code": "attempt_limit_exceeded", "message": "…"}}`.
- Время — ISO 8601, в базе хранится в UTC. В отчётах и выгрузках время показывается в `Asia/Almaty`.

## Основные группы

| Группа | Эндпоинты |
|---|---|
| Сеть | `GET /health` |
| Вход | `POST /auth/login`, `GET /auth/me`, `POST /devices` → `{device_id, secret_b64}` |
| Пользователи | `GET/POST /users`, `PATCH/DELETE /users/{id}`, `GET/POST /departments`, `POST /imports/users?dry_run=`, `GET /exports/users?format=xlsx\|csv` |
| Файлы | `POST /files` (multipart, запускает конвертацию), `GET /files/{id}`, `GET /files/{id}/offline` (ETag = sha256), `GET /files/{id}/info`, `POST /files/{id}/retry` |
| Курсы | `GET/POST /courses`, `GET/PATCH/DELETE /courses/{id}`, `POST /courses/{id}/publish`, `POST /courses/{id}/unpublish`, `GET /courses/{id}/package` |
| Материалы | `POST /courses/{id}/materials`, `PATCH/DELETE /materials/{id}`, `POST /courses/{id}/materials/reorder` |
| Тесты | `GET/PUT /courses/{id}/test` |
| Назначения | `POST /assignments`, `GET /assignments?course_id=`, `DELETE /assignments/{id}`, `GET /assignments/my` |
| Попытки | `POST /attempts`, `GET /attempts/my`, `GET /reviews`, `POST /reviews/{answer_id}` |
| Библиотека | `GET/POST /library`, `PATCH/DELETE /library/{id}`, `GET/POST /categories?kind=` |
| Синхронизация | `POST /sync`, `GET /sync/state`, `POST /sync/qr` |
| Отчёты | `GET /reports/{sessions\|materials-time\|attestation\|summary\|sync}`, `GET /reports/{name}/export?format=xlsx\|csv`. Фильтры: `from`, `to`, `department_id`, `user_id`, `course_id` |
| Аттестация | `GET /certificates/{id}/pdf`, `GET /certificates/verify/{code}` (публично), `GET /protocols/attestation?course_id=&department_id=&format=pdf` |
| 360 | `GET/POST /competencies`, `POST /assessments`, `GET /assessments`, `GET /assessments/my-tasks`, `POST /assessments/{id}/responses`, `GET /assessments/{id}/profile`, `POST /assessments/{id}/close` |
| Тренажёр | `GET/POST /scenarios`, `GET/PUT/DELETE /scenarios/{id}` |

## POST /sync

```json
{
  "device_id": "…",
  "client_now": "2026-11-21T03:12:05.120Z",
  "online_since": "2026-11-21T03:12:04.300Z",
  "items": [
    {"id": "<uuid>", "kind": "event", "payload": {"type": "material_interval", "course_id": "…", "material_id": "…",
      "client_seq": 17, "started_at_client": "…", "ended_at_client": "…", "duration_ms": 30000, "created_online": false}},
    {"id": "<uuid>", "kind": "attempt", "payload": {"test_id": "…", "course_version": 2, "started_at": "…", "finished_at": "…",
      "client_score": 85.0, "answers": [{"question_id": "…", "selected_option_ids": ["…"]}]}},
    {"id": "<uuid>", "kind": "assessment_response", "payload": {"assessment_id": "…", "competency_id": "…", "score": 4, "comment": null}},
    {"id": "<uuid>", "kind": "scenario_run", "payload": {"scenario_id": "…", "path": ["n1", "n2_good"], "total_score": 6, "max_score": 8}}
  ]
}
```

Ответ: `{accepted[], duplicates[], rejected[{id, reason}], server_now, clock_offset_ms, attempt_results[{id, score, status, certificate_number}]}`.

- Сервер сам вычисляет `offset = server_now − client_now` и сдвигает на него время событий.
- Каждый элемент обрабатывается в своей точке сохранения (savepoint): ошибка одного не отменяет остальные.
- Повторная отправка возвращает элементы в `duplicates` и не создаёт новых строк.

## QR-формат

- Чанк: `DPQR1|<batch_id>|<i>|<n>|<crc32 hex>|<данные>` (до 700 символов данных).
- Склеенные данные: `base64url(deflate(JSON-пакета)) + "." + base64url(HMAC-SHA256(device_secret, deflate-байты))`.
- Подтверждение приёма: `DPACK1|<batch_id>|<accepted_count>|base64url(HMAC-SHA256(device_secret, batch_id))`.

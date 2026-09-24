# Тестовые данные

Примеры тел запросов для собственного API (см. `openapi.yaml` и `DATA-API.yaml` в корне репозитория).

## Сценарий проверки через REST API напрямую (без MAX)

1. Поднять стек: `docker compose up --build` (из корня репозитория).
2. Проверить, что сервис жив: `GET http://localhost:3000/health` → `{"ok": true}`.
3. Создать вакансию: `POST http://localhost:3000/api/vacancies`, тело — `vacancy-create.json`.
   В базе к этому моменту должен существовать пользователь с `id = 1` (роль employer) —
   на MVP пользователи создаются автоматически при первом сообщении боту в MAX
   (`upsertUser`, см. `backend/src/users/service.ts`), отдельной ручки регистрации нет.
4. Опубликовать вакансию: `POST http://localhost:3000/api/vacancies/{id}/publish`.
5. Создать отклик: `POST http://localhost:3000/api/applications`, тело — `application-create.json`
   (нужен существующий пользователь-кандидат с `id = 2`).
6. Посмотреть воронку: `GET http://localhost:3000/api/vacancies/{id}/applications`.
7. Сменить статус отклика: `PATCH http://localhost:3000/api/applications/{id}`, тело `{"status": "invited"}`.

## Основной сценарий (через MAX — то, что реально проверяется жюри)

Описан в README.md в корне репозитория и в `docs/ТЗ — Ассистент сезонного найма (MAX).md`,
раздел 3 ("Роли") — команда `/новая_вакансия` в чате с ботом → диалог из 6 шагов → карточка
с кнопкой «Откликнуться».

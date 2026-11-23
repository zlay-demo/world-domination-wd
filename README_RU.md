# World Domination | WD v2

Следующий прототип Telegram Mini App: главное меню, создание комнаты, выбор любой доступной эпохи, исторический/альтернативный сценарий, прямое изменение эпохи/сценария создателем, голосование участников за смену настроек, код приглашения, присоединение, список участников, готовность и запуск создателем.

## Требования
- Telegram-бот от @BotFather.
- Cloudflare аккаунт.
- GitHub аккаунт для загрузки файлов с Android.
- Cloudflare Worker + Static Assets + D1.

## Развёртывание
1. Создай D1 базу `world-domination-wd`.
2. Выполни SQL из `schema.sql` в D1 Console.
3. Скопируй Database ID в `wrangler.toml`.
4. Укажи username бота без @ в `BOT_USERNAME`.
5. Загрузи файлы в GitHub, сохрани структуру проекта.
6. Подключи репозиторий в Cloudflare Workers Builds либо используй Wrangler в Termux.
7. Добавь секреты Worker: `BOT_TOKEN`, `WEBHOOK_SECRET`, `APP_URL`.
8. `APP_URL` — HTTPS URL Worker после первого deploy.
9. Установи webhook:
`https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<WORKER-ДОМЕН>/telegram/webhook&secret_token=<WEBHOOK_SECRET>`
10. Открой бота, отправь `/start`, нажми «Открыть WD».

## Android без компьютера
Можно пользоваться браузером телефона для GitHub и Cloudflare Dashboard. Если Dashboard не позволяет собрать проект из исходников в текущем интерфейсе, используй Termux + Wrangler (инструкция в `ANDROID_SETUP_RU.md`).

## Важно
- Никогда не публикуй BOT_TOKEN и WEBHOOK_SECRET.
- Telegram initData проверяется на Worker.
- Не вставляй реальные секреты в GitHub.
- Бесплатные планы имеют квоты и ограничения.
- В текущем v3 карта — визуальный макет, а мультиплеер покрывает создание/вход/готовность/старт комнаты. Полноценный игровой симулятор будет следующим этапом.

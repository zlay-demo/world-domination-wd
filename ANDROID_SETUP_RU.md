# Установка с Android

## Вариант A — GitHub + Cloudflare Dashboard
1. Скачай ZIP и распакуй его приложением-файловым менеджером.
2. В браузере открой GitHub и создай новый репозиторий.
3. Загрузи содержимое папки проекта, а не сам ZIP.
4. В Cloudflare открой Workers & Pages и создай Worker.
5. Если доступна GitHub-интеграция Builds, подключи репозиторий. Укажи build command `npm install` и deploy command `npx wrangler deploy`.
6. Перед первым deploy создай D1 и внеси Database ID в wrangler.toml.
7. В настройках Worker → Variables and Secrets добавь `BOT_TOKEN`, `WEBHOOK_SECRET`, `APP_URL` как secrets.
8. После первого deploy возьми адрес `workers.dev`, добавь его как `APP_URL`, затем повторно deploy.
9. Настрой webhook Telegram.

## Вариант B — Termux
Установи Termux из F-Droid. Затем выполни:
```bash
pkg update && pkg install nodejs-lts git
git clone https://github.com/ВАШ-ЛОГИН/ВАШ-РЕПОЗИТОРИЙ.git
cd ВАШ-РЕПОЗИТОРИЙ
npm install
npx wrangler login
npx wrangler secret put BOT_TOKEN
npx wrangler secret put WEBHOOK_SECRET
npx wrangler secret put APP_URL
npx wrangler deploy
```
Wrangler запросит значения секретов по одному. Не отправляй их никому и не вставляй в публичные сообщения.

## Подключение D1
Если создаёшь D1 из Dashboard, выполни schema.sql в Console и скопируй ID в wrangler.toml. Если работаешь Wrangler CLI, можно создать базу:
```bash
npx wrangler d1 create world-domination-wd
```
Затем вставь выданный `database_id` в wrangler.toml и выполни:
```bash
npx wrangler d1 execute world-domination-wd --remote --file=./schema.sql
```

## Webhook
Сгенерируй секретную строку для WEBHOOK_SECRET (латиница и цифры, не менее 32 символов). Установи webhook URL через Telegram Bot API. Не делись ссылкой с токеном.

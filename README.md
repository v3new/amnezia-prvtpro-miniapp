# amnezia-prvtpro-miniapp

## 1. Что такое

`amnezia-prvtpro-miniapp` - Telegram Mini App для управления VPN-подключениями на базе
[Amnezia-Web-Panel](https://github.com/PRVTPRO/Amnezia-Web-Panel).

Это личный кабинет VPN внутри Telegram: пользователь открывает мини-приложение, авторизуется через Telegram init data
и управляет своими подключениями без отдельного логина, пароля и ручной выдачи конфигов администратором.

## 2. Для чего служит и какой функционал даёт

Проект нужен как витрина самообслуживания для пользователей, уже заведённых в Amnezia-Web-Panel. Администратор
продолжает управлять сервером и доступами в панели, а пользователь сам выполняет повседневные действия в Telegram.

Функционал для конечного пользователя:

- просмотр профиля, срока доступа, статуса аккаунта, лимита и расхода трафика;
- просмотр статуса VPN-сервера, доступных протоколов и примерного ping;
- список своих VPN-подключений и количество занятых слотов;
- создание нового подключения с выбором устройства, протокола и описания;
- получение конфигурации как QR-кода, текстового конфига, VPN-ссылки или файла;
- скачивание конфига напрямую или в zip-архиве через временную защищённую ссылку;
- удаление неиспользуемых подключений;
- инструкции по настройке для разных устройств и платформ;
- переход к администратору или донату по ссылкам из приложения.

## 3. Стек

- Runtime/package manager: Bun.
- Monorepo: Bun workspaces `client` и `server`.
- Backend: Hono, grammY, JWT через `jose`, Zod, `lru-cache`.
- Frontend: React, Vite, React Router, Tailwind CSS, i18next, Zod.
- Инструменты качества: TypeScript strict, Biome, Bun test.

## 4. Структура

```text
client/                 React/Vite Telegram Mini App
client/src/api          API-клиент и Zod-схемы ответов
client/src/components   Переиспользуемые UI-компоненты
client/src/i18n         Переводы ru/en
client/src/pages        Экраны мини-приложения

server/                 Bun/Hono API и Telegram bot
server/src/routes       Hono route modules
server/src/panel        Клиент и парсеры Amnezia-Web-Panel
server/src/lib          Общие server-утилиты
server/src/bot          Telegram bot handlers и digest
```

Сервер отдаёт собранный `client/dist`, публикует API в `/api/v1/*`, ссылки скачивания в `/dl/*`, health check в
`/health` и внутренние cron-эндпоинты в `/internal/*`.

## 5. Как запустить

Требования:

- Bun `1.1.34+`;
- Telegram bot token и Mini App URL;
- запущенная Amnezia-Web-Panel с API token.

Подготовить переменные окружения:

```bash
cp .env.example .env
```

Установить зависимости и запустить:

```bash
bun install
bun run dev
```

Production flow:

```bash
bun run build
bun run start
```

Проверки:

```bash
bun run format
bun run check
bun run typecheck
bun run test
```

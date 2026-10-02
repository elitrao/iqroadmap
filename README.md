# iqroadmap

Интерактивная дорожная карта релизов AI Аналитика.

## Cloudflare Workers

- Build command: `npm run build`
- Deploy command: `npx wrangler@4 deploy`
- Production branch: `main`

Данные карты хранятся в Durable Object и видны всем посетителям. Чтобы разрешить редактирование только владельцу, добавьте в Cloudflare Worker секрет `EDITOR_KEY`. При первом нажатии «Редактировать» сайт попросит этот ключ и сохранит его только в текущей вкладке браузера.

Локальный предпросмотр запускается командой `npm run preview`.

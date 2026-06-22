# WhatsApp Order Bot

Listens to one WhatsApp chat, parses forwarded customer orders (text + a shared location
pin) with an LLM, and writes them to the app's **review inbox** (`order_inbox` in Supabase).
The admin then reviews and confirms each order in the web app.

> ⚠️ Uses **whatsapp-web.js** (drives WhatsApp Web in a headless Chromium). This is against
> WhatsApp's ToS and carries a small ban risk — fine for a personal test, but plan to move to
> the official WhatsApp Cloud API if this becomes critical.
>
> **Resource note:** it runs a headless Chromium, so give the host **~1–2 GB RAM** (a home
> PC / Raspberry Pi 4+ or an Oracle/GCP always-free VM). Tiny 512 MB hosts will OOM.
> Because the bot links to *your own* number, messages **you forward** into the Orders chat
> are processed too (it listens to your own messages, not just incoming ones).

## How it works
1. The owner forwards a customer's **order text** and **shares the location** into a dedicated
   "Orders" chat (a WhatsApp group containing only the owner, or the owner's own "message
   yourself" chat).
2. The bot pairs the most recent text + location from the same sender within `PAIR_WINDOW_MS`.
3. It parses the text via Sumopod (OpenAI-compatible) into name / items / qty / notes and
   matches your product catalog, then inserts a `pending` row into `order_inbox`.
4. You open **Inbox** in the app, review/edit, and **Confirm** → a real customer + order are
   created with the coordinates.

### Shortcuts
- If the order text matches an **existing customer by name AND phone** who already has a saved
  location, the order is created immediately — no pin or wait needed.
- If **no pin** arrives within `PAIR_WINDOW_MS`, the order is still created when an **address**
  was detected in the text (location left blank for you to set in the Inbox); otherwise it's
  dropped and logged.

## Commands
Messages that start with `/` are commands (never treated as orders). Plain text / forwards
still auto-create orders as above.
- `/addcustomer <name> <phone>` — saves the customer, then **send a location** (pin or Maps
  link) within `PAIR_WINDOW_MS` to store their delivery point. Re-adding the same name+phone
  updates the existing record instead of duplicating. Example:
  `/addcustomer Fahruddin +62 878-3831-2663`
- `/cancel` — clear any in-progress order/customer state.
- `/help` — list commands.

## Setup
```bash
cd whatsapp-bot
npm install
cp .env.example .env      # fill in the values
```

Fill `.env`:
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — from Supabase → Project Settings → API.
- `SUMOPOD_API_KEY`, `SUMOPOD_BASE_URL`, `SUMOPOD_MODEL` — from ai.sumopod.com (a cheap model
  like `deepseek-chat` or a Gemini Flash id is plenty).
- `ORDERS_CHAT_JID` — find it once (below).

## Find your Orders chat id
```bash
npm run discover
```
Scan the QR (WhatsApp → Settings → Linked devices). Then send any message in your Orders chat;
the terminal prints `chat=...@g.us` (group) or `...@s.whatsapp.net` (direct). Copy that into
`ORDERS_CHAT_JID` in `.env`.

## Run
```bash
npm start
```
First run shows a QR — scan it once. The session is saved in `auth/` and survives restarts.

## Keep it always-on (free options)
- **Home device / Raspberry Pi** — simplest and truly free. Run under `pm2` or a systemd
  service so it restarts on boot.
- **Oracle Cloud / GCP always-free VM** — a free 24/7 Linux VM; run the same way or via Docker.
- Avoid PaaS free tiers that sleep on idle (e.g. Render free) — they drop the WhatsApp socket.

### Docker
```bash
docker build -t whatsapp-bot .
docker run -d --restart unless-stopped -v "$PWD/auth:/app/auth" --env-file .env whatsapp-bot
```

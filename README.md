# BotGrid MVP

BotGrid is a multi-user control panel for **cracked Java Edition** Minecraft bots.

Each user can:

- create an account
- save one or more servers
- deploy a bot for each server
- see live bot status and coordinates
- toggle anti-AFK and auto-reconnect
- send chat messages
- move the bot
- break the nearest matching block

## What this project is

This is an MVP architecture for the product you described:

- website login
- per-user saved bots
- automatic bot start after restart
- live bot info in the panel
- bot controls from the browser

## What "24/7" really needs

This app must run on an **always-on VPS or Node server**.

It will **not** stay 24/7 on:

- GitHub Pages
- normal static hosting
- a sleeping home PC

Use a VPS, Docker host, or a Node host that supports long-running processes.

## Stack

- Node.js
- Express
- express-session
- Mineflayer
- file-based JSON storage for MVP

## Setup

1. Copy `.env.example` to `.env`
2. Change `SESSION_SECRET`
3. Install packages

```bash
npm install
```

4. Start the app

```bash
npm start
```

5. Open:

```text
http://localhost:3000
```

## Deploy

### Docker

```bash
docker build -t botgrid .
docker run --env-file .env -p 3000:3000 botgrid
```

### VPS

Run on Ubuntu or another Linux VPS:

```bash
npm install
npm start
```

For real 24/7 uptime, run it with a process manager:

```bash
pm2 start server.js --name botgrid
pm2 save
pm2 startup
```

## Important limitation for this MVP

- storage is JSON file based, not a real database
- no WebSocket live streaming yet, the UI polls every 5 seconds
- bots use `auth: 'offline'` for cracked servers
- advanced pathfinding is not included yet
- breaking blocks is basic and only looks for nearby diggable blocks

## Good next steps

If you want to turn this into a real production service, the next upgrades should be:

1. PostgreSQL or SQLite instead of JSON files
2. WebSockets for live bot updates
3. queue/worker split for bot runtimes
4. per-user bot limits
5. better security and rate limiting
6. remote logs and crash monitoring

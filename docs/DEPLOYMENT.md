# Deploying and operating ASTRA

## 1. Run locally (development / demo)

```bash
cp .env.example .env          # then fill in the secrets (openssl rand -hex 32)
docker compose up -d --build
open http://localhost
```

The database schema is created and upgraded automatically when the backend starts. The first user whose email is in `ADMIN_EMAILS` becomes an admin.

## 2. Public server with HTTPS

Requirements: a Linux VPS with 2 vCPU / 4 GB RAM (Hetzner CX22, DigitalOcean, AWS Lightsail), Docker with Compose v2.24 or newer, and a domain name.

1. Point a DNS **A record** for your domain (e.g. `astra.example.com`) at the server's IP.
2. Firewall: allow only 22, 80 and 443.
   ```bash
   ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
   ```
3. Clone and configure:
   ```bash
   git clone https://github.com/umairhameed1620-oss/astra-digital-twin.git /opt/astra && cd /opt/astra
   cp .env.example .env && nano .env     # set ASTRA_DOMAIN, secrets, ADMIN_EMAILS, SMTP, Space-Track
   ```
4. Start with the production overlay:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
   docker compose logs -f caddy          # wait for "certificate obtained successfully"
   ```
5. Open `https://<your-domain>`, register with an `ADMIN_EMAILS` address, then set `ALLOW_REGISTRATION=false` and restart the backend if customers should only get accounts from you.

Updating:
```bash
cd /opt/astra && git pull && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

## 3. Email and Slack alerts

- **Email:** set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `SMTP_FROM` in `.env` (any SMTP provider works). Restart the backend, then use **Alerts → Send test alert**.
- **Slack:** each user pastes a Slack *incoming webhook* URL on the Alerts page. No server configuration is needed.
- **Telegram (free, to your phone):** in Telegram, message **@BotFather**, send `/newbot`, choose a name and a username ending in `bot`, and copy the token into `TELEGRAM_BOT_TOKEN` in `.env`. Restart the backend. Each user then clicks **Connect Telegram** on the Alerts page and presses **START** in the bot chat. No chat IDs are needed.

Twins are screened automatically while their status is **Launched** or **Operational**, at the interval each user sets (default 6 hours). An alert is sent when an event is new or its severity increases.

## 4. Space-Track CDMs

Create a free account at space-track.org, set `SPACETRACK_USER` and `SPACETRACK_PASSWORD`, and restart. Every `SPACETRACK_POLL_HOURS` (default 8), ASTRA pulls the public CDMs for every NORAD-linked twin that is Launched or Operational. Operators can also upload full CDMs (with covariance) on the Conjunction page, and ASTRA recomputes Pc with Foster's method.

Read and follow the Space-Track user agreement. In particular, do not redistribute Space-Track data outside the operators entitled to it.

## 5. Backups and restore

The `backup` service writes a compressed dump to `./backups` every night at `BACKUP_HOUR_UTC` and keeps `BACKUP_KEEP_DAYS` days.

Copy backups off the server, for example with a nightly cron job to another provider:
```bash
rclone copy /opt/astra/backups remote:astra-backups --max-age 48h
```

Restore (this replaces the current data):
```bash
docker compose stop backend
docker compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' < backups/astra-YYYYmmdd-HHMM.dump
docker compose start backend
```
Test a restore on a spare machine at least once a quarter.

## 6. Monitoring

- **Uptime:** add an HTTPS monitor for `https://<your-domain>/api/health` in UptimeRobot, Better Stack or similar (alerts you if the site or database is down).
- **Metrics:** Prometheus scrapes the backend. Grafana runs on `127.0.0.1:3001`; reach it through an SSH tunnel: `ssh -L 3001:localhost:3001 user@server`, then open http://localhost:3001.
- **Logs:** `docker compose logs -f backend` (JSON lines in production).
- **Scheduler status:** the Alerts page shows the last automatic check and any error.

## 7. Configuration reference

All settings are in `.env.example`, with comments. The most important are:

| Variable | Purpose |
|---|---|
| `JWT_SECRET` | Session signing key (required, 32+ random characters) |
| `ADMIN_EMAILS` | Emails promoted to admin |
| `ALLOW_REGISTRATION` | `false` to stop self-sign-up |
| `ASTRA_DOMAIN` | Public domain for HTTPS |
| `SMTP_*` | Email alerts |
| `SPACETRACK_*` | Automatic CDM import |
| `PC_CRITICAL`, `PC_WARNING` | Severity thresholds (defaults 1e-4 / 1e-6) |
| `PC_HBR_M` | Combined hard-body radius in metres (default 15) |
| `CONJ_WINDOW_HOURS`, `CONJ_REPORT_KM` | Screening window and alert radius |

# Deploying and operating ASTRA

## 1. Run locally (development / demo)

```bash
cp .env.example .env          # then fill in the secrets (openssl rand -hex 32)
docker compose up -d --build
open http://localhost
```

The database schema is created and upgraded automatically when the backend starts. The first user whose email is in `ADMIN_EMAILS` becomes an admin.

## 2. Public server with HTTPS

### Quick install (recommended)

On a fresh Ubuntu 22.04/24.04 server (2 vCPU / 4 GB RAM, e.g. Hetzner CX22), log in as root and run:

```bash
curl -fsSL https://raw.githubusercontent.com/umairhameed1620-oss/astra-digital-twin/main/scripts/deploy-vps.sh | bash
```

The script installs Docker, opens only ports 22/80/443, clones ASTRA to `/opt/astra`, creates `.env` with random secrets, asks for your admin email (and optionally a Gmail app password and Space-Track login), and starts the stack with automatic HTTPS. Without a domain it uses `<server-ip>.sslip.io`, which resolves to the server and gets a normal Let's Encrypt certificate. Update later with `bash /opt/astra/scripts/update.sh`.

If the repository is private, first run `export ASTRA_REPO=https://<github-token>@github.com/umairhameed1620-oss/astra-digital-twin.git` (a fine-grained token with read access to this repository), then download and run the script.

### Manual install

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

Twins are screened automatically while their status is **Launched** or **Operational**, at the interval each user sets (default 6 hours). An alert is sent when an event is new or its severity increases.

## 4. Space-Track CDMs

Create a free account at space-track.org, set `SPACETRACK_USER` and `SPACETRACK_PASSWORD`, and restart. Every `SPACETRACK_POLL_HOURS` (default 8), ASTRA pulls the public CDMs for every NORAD-linked twin that is Launched or Operational. Operators can also upload full CDMs (with covariance) on the Conjunction page, and ASTRA recomputes Pc with Foster's method.

Read and follow the Space-Track user agreement. In particular, do not redistribute Space-Track data outside the operators entitled to it.

## 5. Teams, two-factor login and ephemerides

- **Teams:** each sign-up creates a team with the new user as owner. Owners and admins invite colleagues from the **Team** page; with SMTP configured the invitation is emailed, otherwise copy the link. Links use `PUBLIC_URL`, or `https://ASTRA_DOMAIN` in production. With `ALLOW_REGISTRATION=false` only invited people can create accounts.
- **Two-factor login:** set `TOTP_ENCRYPTION_KEY` once (the install script does this) and keep it with your backups of `.env`. If a user loses both their phone and recovery codes, a server admin can reset their 2FA on the Admin page.
- **Operator ephemerides (CCSDS OEM):** uploaded on **3D Visualiser → Operator ephemeris** (up to 12 MB). nginx allows 12 MB request bodies on `/api/`.

Upgrading from 2.2: migration 008 runs automatically. Every existing user becomes the owner of their own team, and their satellites, missions and validation history move into it. Users can then be invited into one shared team; if they were alone in their old team, their satellites move with them.

## 6. Validation against CDMs

The **Validation** page compares ASTRA's own prediction with every CDM stored for a NORAD-linked twin (Space-Track public CDMs and uploaded CDMs from the last `VALIDATION_LOOKBACK_DAYS`, default 14). For each CDM ASTRA propagates both objects from the latest public TLEs, finds its own TCA within ±45 minutes of the CDM's TCA and records the differences in TCA, miss distance, Pc and severity. A run happens automatically once a day after `VALIDATION_HOUR_UTC` (default 06) and can be started by hand; every run can be downloaded as CSV or PDF.

Use **Add starter set** to track 20 well-known LEO satellites. They are added as Operational with alerts off, so they are screened and validated without sending alerts.

## 7. Backups and restore

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

## 8. Monitoring

- **Uptime:** add an HTTPS monitor for `https://<your-domain>/api/health` in UptimeRobot, Better Stack or similar (alerts you if the site or database is down).
- **Metrics:** Prometheus scrapes the backend. Grafana runs on `127.0.0.1:3001`; reach it through an SSH tunnel: `ssh -L 3001:localhost:3001 user@server`, then open http://localhost:3001.
- **Logs:** `docker compose logs -f backend` (JSON lines in production).
- **Scheduler status:** the Alerts page shows the last automatic check and any error.

## 9. Configuration reference

All settings are in `.env.example`, with comments. The most important are:

| Variable | Purpose |
|---|---|
| `JWT_SECRET` | Session signing key (required, 32+ random characters) |
| `ADMIN_EMAILS` | Emails promoted to admin |
| `ALLOW_REGISTRATION` | `false` to stop new teams signing up (invitations still work) |
| `TOTP_ENCRYPTION_KEY` | Encrypts two-factor secrets; keep it stable |
| `PUBLIC_URL`, `INVITE_EXPIRY_DAYS` | Invitation links |
| `ASTRA_DOMAIN` | Public domain for HTTPS |
| `SMTP_*` | Email alerts |
| `SPACETRACK_*` | Automatic CDM import |
| `PC_CRITICAL`, `PC_WARNING` | Severity thresholds (defaults 1e-4 / 1e-6) |
| `PC_HBR_M` | Combined hard-body radius in metres (default 15) |
| `CONJ_WINDOW_HOURS`, `CONJ_REPORT_KM` | Screening window and alert radius |
| `VALIDATION_DAILY`, `VALIDATION_HOUR_UTC`, `VALIDATION_LOOKBACK_DAYS` | Daily validation run (default on, 06 UTC, 14 days) |

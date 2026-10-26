# ASTRA — Spacecraft Digital Twin & Collision Avoidance

ASTRA lets a satellite operator model a spacecraft as a digital twin, link it to the real satellite in orbit, and get warned before it comes dangerously close to another object. It also helps the operator decide whether and how to manoeuvre.

Built by Umair Hameed / FC Technologies.

---

## What it does

**Track your real satellite**
- Link a twin to a NORAD catalogue number (live CelesTrak element sets, refreshed automatically) or paste your own TLE.
- Visualise the orbit on a 3D Earth with real sun position, day/night, ground track and live telemetry (SGP4).

**Screen for close approaches**
- Screens every twin against all tracked active satellites plus the major debris clouds (Fengyun-1C, Cosmos-1408, Iridium-33, Cosmos-2251), and against the rest of your own fleet.
- SGP4 propagation on a 30-second grid, with time of closest approach refined to milliseconds.
- Collision probability uses **Foster's 2D method**. Covariance comes from the CDM when available; otherwise it is estimated from the age of the TLE, and labelled as an estimate.
- Imports **Conjunction Data Messages**: CCSDS KVN/XML uploads, plus automatic Space-Track public CDM polling. Pc is recomputed from CDM covariance.

**Get alerted**
- Automatic screening of every Launched/Operational twin at an interval you choose (1–48 h).
- Email (SMTP) and Slack alerts when an event is new or its risk increases, with one alert per object per run and a full alert history.

**Decide on a manoeuvre**
- Trade study of dozens of candidate burns: along-track phasing, radial, and two-burn Hohmann raises/lowers, at several lead times.
- Each option is propagated (J2) and re-evaluated against the threat (new miss distance and Pc), then checked against your ΔV budget.
- The best candidates are **re-screened against the whole catalogue** so the recommended burn does not create a new conjunction.
- One-click **PDF conjunction assessment report** with the events, CDMs, options, recommendation and a review/sign-off block.

**Operate it like a product**
- Roles (admin / engineer / viewer), per-user data isolation, audit trail, rate limiting, input validation.
- Mission lifecycle (planning → active → completed), spacecraft lifecycle (designed → launched → operational → decommissioned).
- Docker Compose deployment with automatic HTTPS (Caddy), nightly database backups, health check, Prometheus/Grafana.

See [SECURITY.md](SECURITY.md) for the security model and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for hosting, backups and monitoring.

---

## Accuracy and limitations

ASTRA is decision support, not a replacement for official conjunction assessment.

- Public TLEs are accurate to roughly 1 km and degrade with age. Pc values computed without CDM covariance are **estimates** and are labelled as such.
- Before manoeuvring, confirm events with CDMs from the 18th/19th Space Defense Squadron (via Space-Track), EU SST or a commercial SSA provider, and coordinate with the other operator if the object is active.
- Manoeuvres are modelled as impulsive burns; finite-burn effects and thruster constraints are not yet modelled.
- Twins that are not linked to a real satellite use an idealised circular design orbit.

---

## Quick start

```bash
cp .env.example .env              # fill in secrets: openssl rand -hex 32
docker compose up -d --build
open http://localhost
```

Register with an email listed in `ADMIN_EMAILS` to get an admin account.

### Tests

```bash
cd backend && npm ci && npm run test:unit
```
The unit tests cover the Foster Pc implementation (checked against closed-form results), TLE validation, CDM parsing, and manoeuvre physics.

---

## Architecture

```
Browser ── HTTPS ── Caddy ── nginx (React app, /api proxy) ── Node.js/Express API ── PostgreSQL
                                                               │
                                                               ├─ Worker threads: SGP4 screening
                                                               ├─ Scheduler: screening, TLE refresh, Space-Track CDMs
                                                               └─ Alerts: SMTP email, Slack webhooks
```

| Area | Technology |
|---|---|
| Frontend | React 18, Three.js, Recharts, satellite.js |
| Backend | Node.js 20, Express, Socket.IO, satellite.js (SGP4), pdfkit, nodemailer |
| Data | PostgreSQL 16 (automatic migrations), CelesTrak GP data, Space-Track CDMs |
| Ops | Docker Compose, Caddy (HTTPS), nginx, Prometheus, Grafana, nightly pg_dump |

### Main API endpoints

| Endpoint | Purpose |
|---|---|
| `PUT /api/spacecraft/:id/orbit` | Link a twin to a NORAD ID or TLE |
| `GET /api/conjunction/:id` | Screening report |
| `GET /api/conjunction/:id/manoeuvre` | Manoeuvre trade study |
| `GET /api/conjunction/:id/report.pdf` | PDF assessment report |
| `POST /api/spacecraft/:id/screen` | Screen now, store events, send alerts |
| `POST /api/spacecraft/:id/cdm` | Import CDM(s) |
| `GET/PUT /api/alerts/settings` | Alert channels and screening interval |
| `GET /api/health` | Health check for uptime monitoring |

---

## Project structure

```
backend/
  server.js            App wiring, sockets, startup (migrations, scheduler)
  api/                 REST routers (spacecraft, conjunction, missions, alerts, admin)
  lib/                 orbit maths, Foster Pc, CDM parser, manoeuvre planner, PDF, alerts, scheduler, security
  utils/conjunction*   Catalogue loading and SGP4 screening worker
  migrations/          SQL migrations (run automatically)
frontend/src/
  pages/               Visualiser, Conjunction, Alerts, Missions, Analytics, Builder ...
  components/visualiser/OrbitalVisualiser.js
infrastructure/        Dockerfiles, nginx, Caddy, backup script, Prometheus
```

---

© FC Technologies. All rights reserved.

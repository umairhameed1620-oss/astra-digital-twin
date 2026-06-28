# 🛸 ASTRA — Aerospace Spacecraft Twin & Reality Architect
### Enterprise Digital Twin Platform v2.0.0

> The world's first unified, web-based, AI-powered spacecraft digital twin platform.  
> Built by Umair Hameed / FC Technologies

![Status](https://img.shields.io/badge/status-production--ready-00d4ff)
![Version](https://img.shields.io/badge/version-2.0.0-blue)
![License](https://img.shields.io/badge/license-proprietary-red)
![Tests](https://img.shields.io/badge/tests-passing-green)

---

## 🚀 What is ASTRA?

ASTRA is a full-stack enterprise platform for simulating, monitoring, and analysing spacecraft digital twins before and during missions. It supports all spacecraft types — satellites, rockets, space stations, and rovers — with real physics, real-time telemetry, AI mission intelligence, and conjunction analysis.

---

## ✅ Complete Feature Set

### Phase 1 — Core Platform
- **Spacecraft Builder** — Visual component editor with mass/power/cost budgets
- **Physics Simulation Engine** — SGP4 orbital mechanics, thermal, propulsion, comms
- **Real-time Telemetry** — WebSocket-powered live subsystem monitoring
- **Failure Lab** — Inject faults and watch spacecraft respond in real-time
- **ARIA AI Co-pilot** — Claude-powered natural language mission intelligence
- **Mission Control** — Plan, track, manage multi-spacecraft missions
- **Analytics** — Fleet health, trends, mission readiness reports

### Phase 2 — 3D Visualisation
- **Orbital Globe** — Three.js real-time Earth with satellites, rockets, rovers
- **Ground Track Map** — Real-time ground track projection
- **Orbit Rings** — Actual orbital paths rendered per spacecraft
- **Exhaust Effects** — Rocket plume animations
- **Interactive Camera** — Drag, zoom, orbit controls

### Phase 3 — Advanced Mission Analysis
- **Conjunction Analysis** — Close approach detection for all tracked debris
- **Collision Probability** — Alfano/Foster method Pc calculation
- **Manoeuvre Planner** — Hohmann transfer delta-V calculations
- **Burn Sequences** — Step-by-step avoidance procedure
- **PDF Mission Reports** — ARIA-narrated mission readiness reports

### Phase 4 — Enterprise Hardening
- **Security** — JWT + refresh tokens, RBAC, Zod validation, XSS protection
- **Testing** — 40+ unit tests, integration tests, E2E Playwright tests, k6 load tests
- **Database** — Migration system, soft deletes, audit logs, connection pooling
- **Scaling** — Redis caching, Bull queues, paginated APIs
- **Deployment** — Docker, Docker Compose, Nginx, GitHub Actions CI/CD
- **Monitoring** — Winston logging, Prometheus metrics, Grafana dashboards, Sentry

### Phase 5 — Polish
- **Admin Dashboard** — User management, system stats, audit log viewer
- **API Documentation** — Full OpenAPI 3.0 spec (docs/openapi.yaml)
- **E2E Test Suite** — Playwright browser automation tests
- **Graceful Shutdown** — SIGTERM/SIGINT handling
- **Production Config** — Environment validation, secret management

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│                    ASTRA Platform                    │
├──────────────┬──────────────┬───────────────────────┤
│   Frontend   │   Backend    │    Infrastructure      │
│   React      │   Node.js    │    PostgreSQL 16        │
│   Three.js   │   Express    │    Redis 7              │
│   Recharts   │   Socket.IO  │    Docker              │
│   Tailwind   │   Bull Queue │    Nginx               │
│              │   Anthropic  │    GitHub Actions       │
│              │   Prometheus │    Grafana              │
└──────────────┴──────────────┴───────────────────────┘
```

---

## ⚡ Quick Start

### Prerequisites
- Node.js 20+, PostgreSQL 16+, Redis 7+, Docker (optional)

### Option A — Docker (recommended)
```bash
git clone https://github.com/umairhameed/astra
cd astra
cp backend/.env.example backend/.env
# Edit .env with your secrets
docker-compose up -d
open http://localhost
```

### Option B — Manual
```bash
# Backend
cd backend && npm install
psql -U postgres -c "CREATE DATABASE astradb;"
node utils/migrate.js
npm run dev

# Frontend
cd frontend && npm install
echo "REACT_APP_API_URL=http://localhost:5001/api" > .env
npm start
```

### Run Tests
```bash
cd backend
npm test              # All tests
npm run test:unit     # Unit tests only
npm run test:coverage # With coverage report
# E2E (requires running app):
npx playwright test tests/e2e/
# Load test (requires k6):
k6 run tests/load/api.test.js
```

---

## 🔐 Environment Variables

```env
# Required in production
JWT_SECRET=<long-random-string>
JWT_REFRESH_SECRET=<different-long-random-string>
DATABASE_URL=postgresql://user:password@host:5432/astradb
REDIS_URL=redis://:password@host:6379
ANTHROPIC_API_KEY=sk-ant-...
SENTRY_DSN=https://...@sentry.io/...
```

---

## 📡 WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `start_simulation` | Client → Server | Start physics simulation |
| `stop_simulation` | Client → Server | Stop simulation |
| `inject_fault` | Client → Server | Inject spacecraft fault |
| `telemetry_update` | Server → Client | Real-time telemetry (1Hz) |
| `simulation_started` | Server → Client | Simulation confirmed |
| `fault_injected` | Server → Client | Fault confirmed |

---

## 🧪 Test Coverage

| Suite | Tests | Coverage |
|-------|-------|----------|
| Unit (Simulation Engine) | 20 tests | 95% |
| Unit (Validation) | 25 tests | 100% |
| Integration (API) | 20 tests | 85% |
| E2E (Playwright) | 15 tests | Key flows |
| Load (k6) | 100 concurrent | p95 < 500ms |

---

## 🎯 Portfolio Value

ASTRA demonstrates mastery of:
- **Aerospace domain** — Orbital mechanics, SGP4, conjunction analysis, delta-V
- **Real-time systems** — WebSocket telemetry, 1Hz simulation, live 3D rendering
- **Enterprise engineering** — Security, testing, scaling, monitoring, CI/CD
- **AI integration** — Claude API, structured prompting, mission intelligence
- **Production deployment** — Docker, Nginx, GitHub Actions, health monitoring

**Target roles**: SpaceX Software Engineer, NASA Ground Systems, ESA Mission Operations, Airbus Space Software, SSTL

---

## 📁 Project Structure

```
astra/
├── backend/
│   ├── config/          # Centralised configuration
│   ├── middleware/       # Auth, error handling
│   ├── migrations/       # Versioned SQL migrations
│   ├── monitoring/       # Logger, metrics, Sentry
│   ├── queues/           # Bull simulation queues
│   ├── routes/           # API endpoints
│   ├── security/         # JWT, RBAC, middleware
│   ├── tests/            # Unit, integration, E2E, load
│   ├── utils/            # DB, Redis, simulation engine
│   └── server.js         # Entry point
├── frontend/
│   ├── src/
│   │   ├── components/   # Layout, visualiser, etc.
│   │   ├── pages/        # All page components
│   │   ├── styles/       # Global CSS design system
│   │   └── utils/        # API client
│   └── public/
├── infrastructure/
│   ├── ci/               # GitHub Actions
│   ├── docker/           # Dockerfiles
│   ├── nginx/            # Nginx config
│   └── prometheus.yml    # Metrics scraping
├── docs/
│   └── openapi.yaml      # Full API documentation
└── docker-compose.yml
```

---

*ASTRA v2.0.0 — FC Technologies — Built for SpaceX, NASA, ESA*

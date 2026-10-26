# Security

This document describes how ASTRA protects customer data, what is in place today, and what an operator deploying ASTRA is responsible for. It is written to be shared with prospective customers during security review.

## Reporting a vulnerability

Email **security@your-domain** (set this to a monitored address before sharing this document) with a description and steps to reproduce. We acknowledge reports within 2 working days and aim to fix critical issues within 7 days. Please do not open public GitHub issues for security problems.

## Data handled

| Data | Where it lives | Notes |
|---|---|---|
| User accounts (name, email, team, bcrypt password hash) | PostgreSQL | Passwords hashed with bcrypt (cost 12); plaintext never stored or logged |
| Two-factor secrets and recovery codes | PostgreSQL | TOTP secrets encrypted with AES-256-GCM (`TOTP_ENCRYPTION_KEY`); recovery codes stored as SHA-256 hashes |
| Spacecraft twins, orbits (TLEs, operator ephemerides), missions | PostgreSQL | Scoped to the owning team on every query |
| Conjunction events, CDMs, validation runs | PostgreSQL | Scoped to the owning team (alerts and alert settings: per user) |
| Public orbital catalogue (CelesTrak GP data) | Backend cache file | Public data |
| Audit trail (logins, role changes, orbit links, CDM imports, reports) | PostgreSQL `audit_logs` | Visible to admins |

ASTRA does not process payment data and does not need personal data beyond work contact details.

## Controls in place

**Authentication and sessions**
- JWT bearer tokens signed with a server secret (`JWT_SECRET`, minimum 32 characters; the server refuses to start with a missing or default secret).
- Tokens expire (default 12 hours). Every request re-reads the user, so disabling an account or changing a role takes effect immediately.
- Minimum password length of 10 characters; login responses do not reveal whether an email exists.
- Rate limits: 20 login attempts / 15 min / IP, 10 registrations / hour / IP, 600 API requests / 15 min / IP.
- Self-registration can be turned off (`ALLOW_REGISTRATION=false`); invited colleagues can still join.
- **Two-factor login (TOTP, RFC 6238):** set up with any authenticator app; codes accepted with ±30 s drift and never twice (replay protection); 10 single-use recovery codes; 10 code attempts / 15 min / IP. After the password a short-lived (5 min) challenge token is issued, which is not a session. Teams can require 2FA; members without it can only reach the set-up screen. Server admins can reset a user's 2FA (audited).
- **Invitations:** random 192-bit tokens, stored only as SHA-256 hashes, single use, bound to the invited email address, expiring after `INVITE_EXPIRY_DAYS` (default 7).

**Authorisation**
- Team roles: `owner`, `admin`, `engineer`, `viewer`. Viewers are read-only; admins manage engineers and viewers; only the owner manages admins and hands over ownership. Nobody can change their own role.
- Platform role `admin` (server administrators, from `ADMIN_EMAILS`) is separate and only grants the Admin page. Admins cannot demote or disable themselves.
- Every spacecraft, mission, CDM, ephemeris, event and validation query is filtered by the authenticated user's team; requests for another team's records return 404. Team membership is re-read on every request, so a removed member loses access immediately.
- Real-time simulation sockets require a valid token and only control the team's own spacecraft.

**Input handling**
- All write endpoints validate input with schemas (zod); request bodies are capped at 2 MB (CDM uploads 1 MB; OEM ephemeris uploads 12 MB and 50,000 states).
- SQL uses parameterised queries only.
- HTML output is escaped; the frontend is served with a restrictive Content-Security-Policy.
- Outbound webhooks are restricted to Slack incoming-webhook URLs (prevents server-side request forgery).

**Transport and network**
- Production deployment (`docker-compose.prod.yml`) terminates HTTPS with automatically renewed certificates and HSTS.
- Only ports 80/443 are public. PostgreSQL, Redis, the backend, Prometheus and Grafana are bound to the internal Docker network or localhost.
- CORS allows the same origin plus an explicit allowlist (`CORS_ORIGINS`).
- Security headers via helmet (backend) and nginx (frontend).

**Operations**
- Database migrations run automatically and transactionally at startup.
- Nightly PostgreSQL backups (`backup` service) retained for 14 days by default. See `docs/DEPLOYMENT.md` for restore steps and off-site copies.
- Health endpoint (`/api/health`) checks the database; suitable for external uptime monitoring.
- Prometheus metrics (`/api/metrics`) are only served inside the Docker network (or with `METRICS_TOKEN`).
- Audit log of security-relevant actions.
- Secrets live in `.env`, which is git-ignored.

## Operator responsibilities

When you deploy ASTRA yourself you are responsible for:
- Keeping the host OS and Docker patched, and restricting SSH (keys only, firewall allowing 22/80/443).
- Generating unique secrets for every deployment and storing `.env` securely. Keep `TOTP_ENCRYPTION_KEY` stable: changing it makes every user set up two-factor login again.
- Copying backups off the server (another region or provider) and testing a restore at least quarterly.
- Setting up external uptime monitoring of `https://<your-domain>/api/health`.
- Reviewing the audit log and user list periodically.

## Known limitations (roadmap)

- No single sign-on (SAML/OIDC) yet.
- Tokens are stored in browser localStorage; a move to httpOnly cookies is planned.
- No formal certification (ISO 27001 / SOC 2) yet.

## Dependencies

Run `npm audit` in `backend/` and `frontend/` before each release and update vulnerable packages.

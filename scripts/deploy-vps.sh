#!/usr/bin/env bash
# One-command ASTRA install on a fresh Ubuntu 22.04 / 24.04 server (run as root).
#
#   curl -fsSL https://raw.githubusercontent.com/umairhameed1620-oss/astra-digital-twin/main/scripts/deploy-vps.sh | bash
#
# What it does: installs Docker, opens only ports 22/80/443, clones ASTRA to /opt/astra, creates .env with
# random secrets, asks for your admin email (and optionally Gmail / Space-Track), starts the production
# stack with automatic HTTPS, and waits until the site answers.
# No domain? It uses <your-ip>.sslip.io, which points at the server and gets a real HTTPS certificate.
# Safe to re-run: an existing .env is kept and the code is updated with git pull.
set -euo pipefail

REPO="${ASTRA_REPO:-https://github.com/umairhameed1620-oss/astra-digital-twin.git}"
DIR="${ASTRA_DIR:-/opt/astra}"
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mError: %s\033[0m\n' "$*" >&2; exit 1; }
ask() { # ask VAR "Question" "default"  (reads from the terminal even when piped from curl)
  local __v="$1" __q="$2" __d="${3:-}" __a=""
  if [ -r /dev/tty ]; then read -r -p "$__q${__d:+ [$__d]}: " __a </dev/tty || true; fi
  printf -v "$__v" '%s' "${__a:-$__d}"
}
ask_secret() {
  local __v="$1" __q="$2" __a=""
  if [ -r /dev/tty ]; then read -r -s -p "$__q: " __a </dev/tty || true; echo >/dev/tty; fi
  printf -v "$__v" '%s' "$__a"
}
rand() { openssl rand -hex "$1"; }

[ "$(id -u)" -eq 0 ] || die "Run as root (e.g. sudo -i first)."
command -v apt-get >/dev/null || die "This script supports Ubuntu/Debian servers."

say "Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl openssl ufw ca-certificates >/dev/null

if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  say "Installing Docker"
  curl -fsSL https://get.docker.com | sh >/dev/null
fi
systemctl enable --now docker >/dev/null

# Building the web app needs ~2 GB of memory; add swap on small servers.
MEM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [ "$MEM_MB" -lt 3500 ] && ! swapon --show | grep -q .; then
  say "Adding 2 GB swap (server has ${MEM_MB} MB RAM)"
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

say "Firewall: allowing SSH, HTTP and HTTPS only"
ufw allow OpenSSH >/dev/null && ufw allow 80/tcp >/dev/null && ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

say "Getting the ASTRA code"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" pull --ff-only
else
  git clone "$REPO" "$DIR" || die "Could not clone $REPO. If the repository is private, run: export ASTRA_REPO=https://<github-token>@github.com/umairhameed1620-oss/astra-digital-twin.git and try again."
fi
cd "$DIR"

if [ ! -f .env ]; then
  say "Creating .env"
  IP=$(curl -fsS4 https://api.ipify.org 2>/dev/null || curl -fsS4 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
  DEFAULT_DOMAIN="${IP//./-}.sslip.io"
  ask DOMAIN "Domain for ASTRA (press Enter to use the free address)" "$DEFAULT_DOMAIN"
  ask ADMIN "Your admin email (you register with this)" ""
  [ -n "$ADMIN" ] || die "An admin email is required."
  ask GMAIL "Gmail address for email alerts (Enter to skip)" ""
  GPASS=""
  [ -n "$GMAIL" ] && ask_secret GPASS "Gmail app password (hidden)"
  ask ST_USER "Space-Track username for official CDMs (Enter to skip)" ""
  ST_PASS=""
  [ -n "$ST_USER" ] && ask_secret ST_PASS "Space-Track password (hidden)"

  umask 077
  {
    echo "# Created by scripts/deploy-vps.sh on $(date -u +%F). Keep this file private."
    echo "ASTRA_DOMAIN=$DOMAIN"
    echo "DB_USER=astra"
    echo "DB_PASSWORD=$(rand 16)"
    echo "DB_NAME=astra"
    echo "REDIS_PASSWORD=$(rand 16)"
    echo "JWT_SECRET=$(rand 32)"
    echo "TOTP_ENCRYPTION_KEY=$(rand 32)"
    echo "JWT_EXPIRES_IN=12h"
    echo "ADMIN_EMAILS=$ADMIN"
    echo "ALLOW_REGISTRATION=true"
    echo "GRAFANA_ADMIN_PASSWORD=$(rand 12)"
    echo "NODE_ENV=production"
    if [ -n "$GMAIL" ] && [ -n "$GPASS" ]; then
      echo "SMTP_HOST=smtp.gmail.com"
      echo "SMTP_PORT=587"
      echo "SMTP_USER=$GMAIL"
      echo "SMTP_PASS=${GPASS// /}"
      echo "SMTP_FROM=\"ASTRA Alerts <$GMAIL>\""
    fi
    if [ -n "$ST_USER" ] && [ -n "$ST_PASS" ]; then
      echo "SPACETRACK_USER=$ST_USER"
      echo "SPACETRACK_PASSWORD=$ST_PASS"
    fi
  } > .env
  chmod 600 .env
else
  say "Keeping existing .env"
fi
DOMAIN=$(grep -E '^ASTRA_DOMAIN=' .env | cut -d= -f2-)
[ -n "$DOMAIN" ] || die "ASTRA_DOMAIN is empty in $DIR/.env"
mkdir -p backups

say "Building and starting ASTRA (first build takes 5-10 minutes)"
$COMPOSE up -d --build

say "Waiting for https://$DOMAIN to come online"
for _ in $(seq 1 60); do
  if curl -fsS "https://$DOMAIN/api/health" >/dev/null 2>&1; then
    printf '\n\033[1;32mASTRA is live: https://%s\033[0m\n' "$DOMAIN"
    echo "1. Open the link and register with $(grep -E '^ADMIN_EMAILS=' .env | cut -d= -f2- | cut -d, -f1) (you become admin)."
    echo "2. Invite colleagues from the Team page. To stop new teams signing up: set ALLOW_REGISTRATION=false in $DIR/.env, then run: cd $DIR && $COMPOSE up -d backend"
    echo "3. To update later: cd $DIR && bash scripts/update.sh"
    exit 0
  fi
  sleep 10
done
echo
echo "The site did not answer over HTTPS yet. Check:"
echo "  - the domain's DNS A record points at this server (sslip.io addresses do this automatically)"
echo "  - logs: cd $DIR && $COMPOSE logs --tail 50 caddy backend"
exit 1

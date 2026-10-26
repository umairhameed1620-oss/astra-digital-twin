#!/usr/bin/env bash
# Update a server installed with deploy-vps.sh: pull the latest code and rebuild. Data and .env are kept.
set -euo pipefail
cd "${ASTRA_DIR:-/opt/astra}"
git pull --ff-only
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker image prune -f >/dev/null
echo "ASTRA updated: https://$(grep -E '^ASTRA_DOMAIN=' .env | cut -d= -f2-)"

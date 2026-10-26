#!/bin/sh
# Nightly PostgreSQL backup: custom-format pg_dump into /backups, old dumps pruned.
# Restore: see docs/DEPLOYMENT.md (section "Backups and restore").
set -eu
KEEP="${BACKUP_KEEP_DAYS:-14}"
HOUR="${BACKUP_HOUR_UTC:-02}"
mkdir -p /backups

backup() {
  f="/backups/astra-$(date -u +%Y%m%d-%H%M).dump"
  if pg_dump -Fc -f "$f.tmp"; then
    mv "$f.tmp" "$f"
    echo "[backup] $(date -u +%FT%TZ) wrote $f ($(du -h "$f" | cut -f1))"
  else
    rm -f "$f.tmp"
    echo "[backup] $(date -u +%FT%TZ) FAILED" >&2
  fi
  find /backups -name 'astra-*.dump' -mtime +"$KEEP" -delete
}

# One backup at start-up if none exists yet, then once a day at BACKUP_HOUR_UTC.
ls /backups/astra-*.dump >/dev/null 2>&1 || backup
while true; do
  now=$(date -u +%s)
  next=$(date -u -d "$(date -u +%Y-%m-%d) ${HOUR}:00:00" +%s 2>/dev/null || echo $((now + 86400)))
  [ "$next" -le "$now" ] && next=$((next + 86400))
  sleep $((next - now))
  backup
done

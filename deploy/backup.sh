#!/bin/sh
# Database backup loop, run by the `backup` service of docker-compose.yml.
#
#   backup.sh          daily dump at BACKUP_HOUR (UTC), forever
#   backup.sh once     one dump now, then exit (scripts/backup-now.sh)
#
# Each dump is a gzipped plain-SQL file in /backups, written under a temporary
# name and renamed only once it is complete and readable, so a crash never
# leaves a corrupt "good" backup. Settings (all optional):
#   BACKUP_HOUR       hour of the day, UTC, to dump at          (default 3)
#   BACKUP_KEEP_DAYS  dumps older than this are deleted         (default 14)
#   BACKUP_S3_URL     s3://bucket/prefix : also upload each dump there
#   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION,
#   AWS_ENDPOINT_URL  credentials, and endpoint for non-AWS S3 (R2, B2, ...)
# The connection (PGHOST, PGUSER, PGPASSWORD, PGDATABASE) comes from the environment.
set -eu

DIR=/backups
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
HOUR="${BACKUP_HOUR:-3}"

log() { echo "[backup] $(date -u +%Y-%m-%dT%H:%M:%SZ) $*"; }

dump() {
  name="piston-$(date -u +%Y%m%d-%H%M%S).sql.gz"
  tmp="$DIR/.$name.partial"
  # --clean --if-exists: the file can be replayed over an existing database.
  # `set -o pipefail` is not POSIX, so a failed pg_dump is detected by checking
  # its exit status through a temporary file instead of the pipe.
  if ! pg_dump --clean --if-exists --no-owner --no-privileges > "$tmp.sql"; then
    rm -f "$tmp.sql" "$tmp"
    log "FAILED: pg_dump exited with an error"
    return 1
  fi
  gzip -c "$tmp.sql" > "$tmp"
  rm -f "$tmp.sql"
  if ! gzip -t "$tmp"; then
    rm -f "$tmp"
    log "FAILED: the dump is not a valid gzip file"
    return 1
  fi
  mv "$tmp" "$DIR/$name"
  log "OK $name ($(du -h "$DIR/$name" | cut -f1))"

  if [ -n "${BACKUP_S3_URL:-}" ]; then
    if aws s3 cp --only-show-errors "$DIR/$name" "${BACKUP_S3_URL%/}/$name"; then
      log "uploaded to ${BACKUP_S3_URL%/}/$name"
    else
      log "FAILED: upload to ${BACKUP_S3_URL} (the local copy is kept)"
    fi
  fi

  # Rotation: delete local dumps older than KEEP_DAYS (S3: use a bucket lifecycle rule).
  find "$DIR" -name 'piston-*.sql.gz' -mtime "+$KEEP_DAYS" -print -delete |
    while read -r old; do log "deleted old backup $old"; done
}

if [ -n "${BACKUP_S3_URL:-}" ] && ! command -v aws >/dev/null 2>&1; then
  log "installing aws-cli for the off-site copy"
  apk add --no-cache --quiet aws-cli
fi

if [ "${1:-}" = once ]; then
  dump
  exit $?
fi

log "started: daily at ${HOUR}:00 UTC, keeping ${KEEP_DAYS} days${BACKUP_S3_URL:+, copying to $BACKUP_S3_URL}"
while true; do
  now=$(date -u +%s)
  # Seconds until the next HOUR:00 UTC.
  wait=$(( (HOUR * 3600 - now % 86400 + 86400) % 86400 ))
  [ "$wait" -eq 0 ] && wait=86400
  log "next backup in ${wait}s"
  sleep "$wait"
  # A failed dump must not stop the loop: tomorrow's run may succeed.
  dump || true
done

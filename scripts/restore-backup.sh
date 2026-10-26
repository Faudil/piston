#!/bin/sh
# Restores a database backup, REPLACING the current data.
#
#   scripts/restore-backup.sh ./piston-20261026-030000.sql.gz     a file on this machine
#   scripts/restore-backup.sh piston-20261026-030000.sql.gz       a file kept in the backup volume
#
# The app is stopped during the restore and started again afterwards. Use
# COMPOSE_FILE if you start the stack with extra files, e.g.
#   export COMPOSE_FILE=docker-compose.yml:docker-compose.proxy.yml
# Pass --yes as the second argument to skip the confirmation.
set -eu
cd "$(dirname "$0")/.."

file="${1:?Usage: scripts/restore-backup.sh <backup.sql.gz | name in the backup volume> [--yes]}"

reader() {
  if [ -f "$file" ]; then cat "$file"; else docker compose exec -T backup cat "/backups/$file"; fi
}

# Fail early (before touching anything) if the file is missing or corrupt.
reader | gzip -t || { echo "Cannot read '$file' as a gzip backup." >&2; exit 1; }

if [ "${2:-}" != "--yes" ]; then
  printf "This REPLACES all data of the database with '%s'. Type 'restore' to continue: " "$file"
  read -r answer
  [ "$answer" = restore ] || { echo "Cancelled."; exit 1; }
fi

echo "Stopping the app..."
docker compose stop web
trap 'echo "Starting the app..."; docker compose start web' EXIT

echo "Restoring..."
# ON_ERROR_STOP: stop at the first error instead of leaving a half-restored database.
reader | gunzip |
  docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -q -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null
echo "Restore complete."

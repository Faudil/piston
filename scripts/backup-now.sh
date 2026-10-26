#!/bin/sh
# Takes a database backup right now (same as the daily one) and lists the
# backups kept. Run it from the repository root on the server.
# Use COMPOSE_FILE if you start the stack with extra files, e.g.
#   export COMPOSE_FILE=docker-compose.yml:docker-compose.proxy.yml
set -eu
cd "$(dirname "$0")/.."

docker compose exec backup /backup.sh once
echo
echo "Backups in the piston-backups volume:"
docker compose exec backup ls -lh /backups

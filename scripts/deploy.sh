#!/usr/bin/env bash
# NextBiz One — VM-side deploy (run by GitHub Actions over SSH, or manually).
# Mirrors NBS deploy.sh: clean git-archive export → compose build → migrate →
# up --wait → nginx reload (cached container-IP trap) → health gate.
# Deploy target: one.nextbizstudio.com (DNS/SSL — Tony, plan §7.2).

set -euo pipefail

MAIN_REPO="${DEPLOY_MAIN_REPO:-$HOME/workspaces/kira/repos/nextbiz-one}"
STAGE_DIR="${DEPLOY_STAGE_DIR:-$HOME/deploy-stage/nextbiz-one}"
DB_CONTAINER="nextbiz_one_db"
APP_CONTAINER="nextbiz_one_app"
NGINX_CONTAINER="joyverse_nginx"
PUBLIC_HOST="https://one.nextbizstudio.com"
export COMPOSE_PROJECT_NAME=nextbiz-one

log() { echo "[deploy] $*"; }

cd "$MAIN_REPO"
log "fetching origin/main…"
git fetch origin main
NEW_SHA=$(git rev-parse origin/main)
log "deploying origin/main @ ${NEW_SHA:0:8}"

rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR"
git archive origin/main | tar -x -C "$STAGE_DIR"
cp "$MAIN_REPO/.env" "$STAGE_DIR/.env"
chmod 600 "$STAGE_DIR/.env"
cd "$STAGE_DIR"

log "building image…"
docker compose build one-app

log "applying migrations…"
for f in db/migrations/*.sql; do
  log "  migration: $f"
  docker exec -i "$DB_CONTAINER" psql -U nextbiz -d nextbiz_one \
    -v ON_ERROR_STOP=1 -f - < "$f" >/dev/null
done

log "starting containers…"
docker compose up -d --wait

log "reloading nginx…"
docker exec "$NGINX_CONTAINER" nginx -t
docker exec "$NGINX_CONTAINER" nginx -s reload

log "health gate…"
code=$(docker exec "$NGINX_CONTAINER" wget -q -O /dev/null -S \
  "http://${APP_CONTAINER}:3000/api/health" 2>&1 | head -1 | grep -oE '[0-9]{3}' || true)
[ "$code" = "200" ] || { echo "[deploy] FAIL: direct health -> ${code:-no-response}"; exit 1; }
log "  direct health -> 200"

body=$(curl -s --max-time 30 "${PUBLIC_HOST}/api/health" || echo "no-response")
echo "$body" | grep -q '"ok":true' || { echo "[deploy] FAIL: public health body wrong: ${body:0:120}"; exit 1; }
# a 200 from the WRONG backend (nginx default server) once passed this gate —
# assert the NBO response shape, not just the status code
echo "$body" | grep -q 'auth_required' && { echo "[deploy] FAIL: wrong backend answered (nginx default server)"; exit 1; }
log "  public health -> NBO ok"

log "✅ deploy healthy at ${NEW_SHA:0:8} — ${PUBLIC_HOST}"

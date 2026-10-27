#!/usr/bin/env bash
# NextBiz One — VM-side deploy (manual, or via the nextbiz-beta-deploy
# systemd timer for beta).
#
# NEVER touches the working checkout (Kira may be mid-sprint on a feature
# branch): deploys from a clean `git archive` export into a staging dir,
# with COMPOSE_PROJECT_NAME pinned so the same containers/volumes are reused.
# Idempotent; safe to re-run on the same SHA.
#
# Environments (docs/release-flow.md):
#   beta  origin/main, auto-deployed every 5 min by the systemd timer.
#         URL beta.one.nextbizstudio.com (public, X-Robots-Tag: noindex).
#         Own DB (nextbiz_one_beta_db) — seed it from a prod dump with --seed.
#         WhatsApp/Meta creds are stubbed in .env.beta: beta can never
#         message real customers or hit live Meta APIs.
#   prod  Joydip's explicit GO only, from a pushed release tag:
#         scripts/deploy.sh --env prod --ref v1.0.0 --approved-by "Joydip 2026-10-26"
#         Refuses without --ref and --approved-by. Audit log:
#         ~/deploy-logs/nextbiz-one-prod.log
#
# Flow: gate → fetch → stage export → build → db up → [seed] → migrations
#       → up --wait → nginx reload (cached container-IP trap) → health gate
#       (direct always; public once the beta DNS record is live).
# Exit non-zero on any failure.

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/deploy.sh --env beta [--ref origin/main] [--seed <pg_dump file>]
  scripts/deploy.sh --env prod --ref <v-tag> --approved-by "Joydip <date>"
EOF
}

MAIN_REPO="${DEPLOY_MAIN_REPO:-$HOME/workspaces/kira/repos/nextbiz-one}"
NGINX_CONTAINER="joyverse_nginx"
LOG_DIR="$HOME/deploy-logs"

ENV="" REF="" APPROVED_BY="" SEED=""
while [ $# -gt 0 ]; do
  case "$1" in
    --env)         ENV="$2"; shift 2 ;;
    --ref)         REF="$2"; shift 2 ;;
    --approved-by) APPROVED_BY="$2"; shift 2 ;;
    --seed)        SEED="$2"; shift 2 ;;
    -h|--help)     usage; exit 0 ;;
    *)             usage >&2; echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

# ---- gates ------------------------------------------------------------------
[ -n "$ENV" ] || { usage >&2; echo "REFUSED: --env is required (beta|prod)" >&2; exit 2; }
case "$ENV" in
  beta|prod) ;;
  *) usage >&2; echo "REFUSED: --env must be 'beta' or 'prod'" >&2; exit 2 ;;
esac

if [ "$ENV" = prod ]; then
  # prod = public deploy = stop-table item (swe-iteration-kernel): Joydip's
  # explicit GO, in writing, logged. No gate, no deploy — no exceptions.
  [ -n "$APPROVED_BY" ] || { echo 'REFUSED: --env prod requires --approved-by "Joydip <date>" — explicit GO required' >&2; exit 2; }
  [ -n "$REF" ] || { echo "REFUSED: --env prod requires --ref <v-tag> (e.g. v1.0.0) — prod ships tagged releases only" >&2; exit 2; }
  case "$REF" in
    v[0-9]*.[0-9]*.[0-9]*) ;;
    *) echo "REFUSED: prod --ref must be a release tag like v1.0.0 (got '$REF')" >&2; exit 2 ;;
  esac
  [ -z "$SEED" ] || { echo "REFUSED: --seed is beta-only" >&2; exit 2; }
else
  REF="${REF:-origin/main}"
  [ -z "$APPROVED_BY" ] || { echo "REFUSED: --approved-by is prod-only" >&2; exit 2; }
fi

# ---- per-env config ---------------------------------------------------------
case "$ENV" in
  beta)
    STAGE_DIR="${DEPLOY_STAGE_DIR:-$HOME/beta-stage/nextbiz-one}"
    COMPOSE_FILE="docker-compose.beta.yml"
    export COMPOSE_PROJECT_NAME="nextbiz-one-beta"
    APP_SVC="one-beta-app"; DB_SVC="one-beta-db"
    APP_CONTAINER="nextbiz_one_beta_app"; DB_CONTAINER="nextbiz_one_beta_db"
    ENV_FILE="$MAIN_REPO/.env.beta"
    PUBLIC_DOMAIN="beta.one.nextbizstudio.com"
    ;;
  prod)
    STAGE_DIR="${DEPLOY_STAGE_DIR:-$HOME/deploy-stage/nextbiz-one}"
    COMPOSE_FILE="docker-compose.yml"
    export COMPOSE_PROJECT_NAME="nextbiz-one"
    APP_SVC="one-app"; DB_SVC="one-db"
    APP_CONTAINER="nextbiz_one_app"; DB_CONTAINER="nextbiz_one_db"
    ENV_FILE="$MAIN_REPO/.env"
    PUBLIC_DOMAIN="one.nextbizstudio.com"
    ;;
esac

[ -f "$ENV_FILE" ] || { echo "REFUSED: env file missing: $ENV_FILE (see .env.beta.example)" >&2; exit 2; }

PUBLIC_HOST="https://$PUBLIC_DOMAIN"
log() { echo "[deploy:$ENV] $*"; }

# audit trail — one line per attempt: timestamp | env | ref | sha | approver | result
mkdir -p "$LOG_DIR"
APP_LOG="$LOG_DIR/nextbiz-one-$ENV.log"
STATE_FILE="$LOG_DIR/nextbiz-one-beta.sha"
NEW_SHA="undeployed"
RESULT="FAILED"
finish() {
  printf '%s | %s | %s | %s | %s | %s\n' \
    "$(date -u +%FT%TZ)" "$ENV" "${REF:-?}" "${NEW_SHA:0:12}" "${APPROVED_BY:-auto}" "$RESULT" \
    >> "$APP_LOG"
}
trap finish EXIT

# ---- deploy -----------------------------------------------------------------
cd "$MAIN_REPO"
log "fetching origin/main (+tags)…"
git fetch origin main --tags --quiet

git rev-parse --verify --quiet "$REF^{commit}" >/dev/null \
  || { echo "REFUSED: ref '$REF' not found after fetch" >&2; exit 2; }
NEW_SHA="$(git rev-parse "$REF^{commit}")"
log "deploying $REF @ ${NEW_SHA:0:8}"

log "staging clean export → $STAGE_DIR"
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR"
git archive "$NEW_SHA" | tar -x -C "$STAGE_DIR"

cp "$ENV_FILE" "$STAGE_DIR/.env"
chmod 600 "$STAGE_DIR/.env"
cd "$STAGE_DIR"

log "building image…"
docker compose -f "$COMPOSE_FILE" build "$APP_SVC"

log "starting DB ($DB_SVC)…"
docker compose -f "$COMPOSE_FILE" up -d "$DB_SVC"

if [ "$ENV" = beta ] && [ -n "$SEED" ]; then
  [ -f "$SEED" ] || { echo "REFUSED: --seed dump not found: $SEED" >&2; exit 2; }
  log "seeding beta DB from $(basename "$SEED") — wipes beta DB…"
  docker exec "$DB_CONTAINER" psql -U nextbiz -d postgres \
    -c 'DROP DATABASE nextbiz_one WITH (FORCE)' \
    -c 'CREATE DATABASE nextbiz_one' >/dev/null
  docker exec -i "$DB_CONTAINER" pg_restore -U nextbiz -d nextbiz_one --no-owner < "$SEED"
  log "  seed restored"
fi

log "applying migrations…"
for f in db/migrations/*.sql; do
  log "  migration: $f"
  docker exec -i "$DB_CONTAINER" psql -U nextbiz -d nextbiz_one \
    -v ON_ERROR_STOP=1 -f - < "$f" >/dev/null
done

log "starting containers…"
docker compose -f "$COMPOSE_FILE" up -d --wait

log "reloading nginx…"
docker exec "$NGINX_CONTAINER" nginx -t
docker exec "$NGINX_CONTAINER" nginx -s reload

log "health gate…"
code=$(docker exec "$NGINX_CONTAINER" wget -q -O /dev/null -S \
  "http://${APP_CONTAINER}:3000/api/health" 2>&1 | head -1 | grep -oE '[0-9]{3}' || true)
[ "$code" = "200" ] || { echo "[deploy:$ENV] FAIL: direct health -> ${code:-no-response}"; exit 1; }
log "  direct health -> 200"

if getent hosts "$PUBLIC_DOMAIN" >/dev/null 2>&1; then
  body=$(curl -s --max-time 30 "${PUBLIC_HOST}/api/health" || echo "no-response")
  echo "$body" | grep -q '"ok":true' || { echo "[deploy:$ENV] FAIL: public health body wrong: ${body:0:120}"; exit 1; }
  # a 200 from the WRONG backend (nginx default server) once passed a naive gate —
  # assert the NBO response shape, not just the status code
  echo "$body" | grep -q 'auth_required' && { echo "[deploy:$ENV] FAIL: wrong backend answered (nginx default server)"; exit 1; }
  log "  public health -> ok"
else
  [ "$ENV" = prod ] && { echo "[deploy:prod] FAIL: $PUBLIC_DOMAIN does not resolve — prod must be publicly reachable"; exit 1; }
  log "  public check SKIPPED (DNS for $PUBLIC_DOMAIN not live yet) — direct gate passed; gate goes live when the DNS record lands"
fi

if [ "$ENV" = beta ]; then
  echo "$NEW_SHA" > "$STATE_FILE"
fi

RESULT="ok"
log "✅ deploy healthy at ${NEW_SHA:0:8} — $PUBLIC_HOST"

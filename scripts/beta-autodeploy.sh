#!/usr/bin/env bash
# Beta auto-deploy poll — invoked every 5 min by the nextbiz-beta-deploy
# systemd timer. Deploys origin/main to beta when the deployed SHA changes.
# deploy.sh is health-gated and only swaps containers after a successful
# build, so a broken main just retries on the next tick (the state file
# only advances on a successful deploy).
#
# State: ~/deploy-logs/nextbiz-one-beta.sha   (written by deploy.sh)
# Logs:  journald — `systemctl status nextbiz-beta-deploy.service`

set -euo pipefail

REPO="${DEPLOY_MAIN_REPO:-$HOME/workspaces/kira/repos/nextbiz-one}"
STATE_FILE="$HOME/deploy-logs/nextbiz-one-beta.sha"
LOCK_FILE="$HOME/deploy-logs/nextbiz-one-beta.lock"

mkdir -p "$(dirname "$STATE_FILE")"

# never overlap a deploy already in flight (manual or another tick)
exec 9>"$LOCK_FILE"
flock -n 9 || { echo "[beta-autodeploy] another deploy holds the lock; skipping"; exit 0; }

cd "$REPO"
git fetch origin main --quiet
NEW_SHA=$(git rev-parse origin/main)
OLD_SHA=$(cat "$STATE_FILE" 2>/dev/null || echo "none")

[ "$NEW_SHA" = "$OLD_SHA" ] && exit 0

echo "[beta-autodeploy] $(date -u +%FT%TZ) origin/main ${OLD_SHA:0:8} → ${NEW_SHA:0:8}; deploying beta"
if bash scripts/deploy.sh --env beta; then
  echo "[beta-autodeploy] beta live @ ${NEW_SHA:0:8}"
else
  echo "[beta-autodeploy] deploy FAILED — beta keeps the previous build; retrying next tick"
  exit 1
fi

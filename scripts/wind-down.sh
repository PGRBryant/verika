#!/usr/bin/env bash
# wind-down.sh — shut down always-on infrastructure at end of a work session.
#
# What this does:
#   1. Sets room404-game-server-dev minInstances 1 → 0  (only service with a floor)
#   2. Throttles any GCP uptime checks to 1 h  (prevents keepalive cold-starts)
#
# Prerequisites: gcloud auth login (ADC), curl, node
# Usage: bash scripts/wind-down.sh

set -euo pipefail

ROOM404_PROJECT="room404-490104"
ROOM404_REGION="us-central1"
ROOM404_SERVICE="room404-game-server-dev"

VERIKA_PROJECT="verika-490105"

echo "=== Verika Ecosystem Wind-Down ==="
echo ""

# ── 1. Room 404 game server ─────────────────────────────────────────────────
echo "→ Scaling ${ROOM404_SERVICE} to minInstances=0..."
gcloud run services update "${ROOM404_SERVICE}" \
  --project="${ROOM404_PROJECT}" \
  --region="${ROOM404_REGION}" \
  --min-instances=0 \
  --quiet
echo "  ✓ Scaled down"
echo ""

# ── 2. Uptime checks → throttle to 1 h ─────────────────────────────────────
echo "→ Checking for uptime monitors to throttle..."
ACCESS_TOKEN=$(gcloud auth print-access-token)

CHECKS=$(curl -sf \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  "https://monitoring.googleapis.com/v3/projects/${VERIKA_PROJECT}/uptimeCheckConfigs" \
  | node -e "
    const d = JSON.parse(require('fs').readFileSync(0, 'utf8'));
    (d.uptimeCheckConfigs || []).forEach(c => console.log(c.name));
  " 2>/dev/null || true)

if [ -z "${CHECKS}" ]; then
  echo "  (no uptime checks configured — nothing to throttle)"
else
  while IFS= read -r check; do
    display=$(basename "${check}")
    echo "  → Throttling ${display} to period=3600s..."
    curl -sf -X PATCH \
      -H "Authorization: Bearer ${ACCESS_TOKEN}" \
      -H "Content-Type: application/json" \
      -d '{"period":"3600s"}' \
      "https://monitoring.googleapis.com/v3/${check}?updateMask=period" \
      > /dev/null
    echo "    ✓ Done"
  done <<< "${CHECKS}"
fi

echo ""
echo "=== Wind-down complete ==="
echo "All Cloud Run services will drain to zero on their own."
echo "Run scripts/wind-up.sh at the start of your next session."

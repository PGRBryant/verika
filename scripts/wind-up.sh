#!/usr/bin/env bash
# wind-up.sh — restore always-on infrastructure at the start of a work session.
#
# What this does:
#   1. Restores room404-game-server-dev minInstances 0 → 1
#   2. Restores any throttled GCP uptime checks back to 60 s
#
# Prerequisites: gcloud auth login (ADC), curl, node
# Usage: bash scripts/wind-up.sh

set -euo pipefail

ROOM404_PROJECT="room404-490104"
ROOM404_REGION="us-central1"
ROOM404_SERVICE="room404-game-server-dev"

VERIKA_PROJECT="verika-490105"

echo "=== Verika Ecosystem Wind-Up ==="
echo ""

# ── 1. Room 404 game server ─────────────────────────────────────────────────
echo "→ Restoring ${ROOM404_SERVICE} to minInstances=1..."
gcloud run services update "${ROOM404_SERVICE}" \
  --project="${ROOM404_PROJECT}" \
  --region="${ROOM404_REGION}" \
  --min-instances=1 \
  --quiet
echo "  ✓ Restored"
echo ""

# ── 2. Uptime checks → restore to 60 s ─────────────────────────────────────
echo "→ Checking for throttled uptime monitors to restore..."
ACCESS_TOKEN=$(gcloud auth print-access-token)

CHECKS=$(curl -sf \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  "https://monitoring.googleapis.com/v3/projects/${VERIKA_PROJECT}/uptimeCheckConfigs" \
  | node -e "
    const d = JSON.parse(require('fs').readFileSync(0, 'utf8'));
    (d.uptimeCheckConfigs || []).forEach(c => console.log(c.name));
  " 2>/dev/null || true)

if [ -z "${CHECKS}" ]; then
  echo "  (no uptime checks configured — nothing to restore)"
else
  while IFS= read -r check; do
    display=$(basename "${check}")
    echo "  → Restoring ${display} to period=60s..."
    curl -sf -X PATCH \
      -H "Authorization: Bearer ${ACCESS_TOKEN}" \
      -H "Content-Type: application/json" \
      -d '{"period":"60s"}' \
      "https://monitoring.googleapis.com/v3/${check}?updateMask=period" \
      > /dev/null
    echo "    ✓ Done"
  done <<< "${CHECKS}"
fi

echo ""
echo "=== Wind-up complete ==="
echo "Room 404 game server will be warm within ~30 s."

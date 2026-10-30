#!/usr/bin/env bash
# Recette de sécurité complète en local : démarre une instance isolée du site
# (originaux dans un dossier temporaire, galeries de test), exécute
# scripts/security-smoke-test.js, puis nettoie tout.
#
# Usage :  bash scripts/security-smoke.sh [port]
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PORT="${1:-${PORT:-3499}}"
BASE_URL="http://127.0.0.1:${PORT}"
PHOTO_FILE="concert.jpg"

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/photos-smoke-XXXXXX")"
ORIGINALS_DIR="$TMP_DIR/originals"
mkdir -p "$ORIGINALS_DIR"

GALLERIES_FILE="$ROOT_DIR/config/galleries.json"
GALLERIES_BACKUP="$TMP_DIR/galleries.json.bak"
HAD_GALLERIES=0
SERVER_PID=""

cleanup() {
    if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
        kill "$SERVER_PID" 2>/dev/null || true
        wait "$SERVER_PID" 2>/dev/null || true
    fi
    if [ "$HAD_GALLERIES" = "1" ]; then
        cp "$GALLERIES_BACKUP" "$GALLERIES_FILE"
    else
        rm -f "$GALLERIES_FILE"
    fi
    rm -rf "$TMP_DIR"
}
trap cleanup EXIT

echo "→ Génération de l'image de test (2400×1600)…"
node -e "
const sharp = require('sharp');
sharp({ create: { width: 2400, height: 1600, channels: 3, background: { r: 12, g: 14, b: 18 } } })
  .jpeg()
  .toFile('$ORIGINALS_DIR/$PHOTO_FILE')
  .then(() => process.exit(0))
  .catch((e) => { console.error(e.message); process.exit(1); });
"

# Galeries de test : nécessaire pour que le kit presse ait une sélection autorisée.
if [ -f "$GALLERIES_FILE" ]; then
    cp "$GALLERIES_FILE" "$GALLERIES_BACKUP"
    HAD_GALLERIES=1
fi
cat > "$GALLERIES_FILE" <<JSON
{
  "metadata": { "version": "smoke", "lastUpdated": null },
  "galleries": [
    {
      "id": "smoke",
      "slug": "smoke",
      "title": "Recette sécurité",
      "artist": "Test",
      "venue": "Local",
      "date": "2026-01-01",
      "published": true,
      "photos": ["$PHOTO_FILE", "smoke-2.jpg", "smoke-3.jpg", "smoke-4.jpg"]
    }
  ]
}
JSON

echo "→ Démarrage du serveur sur le port $PORT…"
PORT="$PORT" \
NODE_ENV=development \
PHOTOS_ORIGINALS_DIR="$ORIGINALS_DIR" \
PHOTO_ORIGINALS_DIR="$ORIGINALS_DIR" \
SESSION_SECRET="smoke-session-secret" \
CONTACT_API_SECRET="smoke-contact-secret" \
ADMIN_REMEMBER_SALT="smoke-admin-salt" \
ADMIN_PASSWORD="smoke-admin-password" \
IMAGE_SECRET_KEY="smoke-image-secret-key-32-characters" \
SITE_URL="$BASE_URL" \
node server.js > "$TMP_DIR/server.log" 2>&1 &
SERVER_PID=$!

for _ in $(seq 1 40); do
    if curl -s -o /dev/null "$BASE_URL/robots.txt"; then break; fi
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
        echo "✗ Le serveur n'a pas démarré. Log :"
        cat "$TMP_DIR/server.log"
        exit 1
    fi
    sleep 0.25
done

if ! curl -s -o /dev/null "$BASE_URL/robots.txt"; then
    echo "✗ Le serveur ne répond pas sur $BASE_URL. Log :"
    cat "$TMP_DIR/server.log"
    exit 1
fi

set +e
SMOKE_BASE_URL="$BASE_URL" SMOKE_PHOTO_FILE="$PHOTO_FILE" node scripts/security-smoke-test.js
STATUS=$?
set -e

if [ "$STATUS" -ne 0 ]; then
    echo
    echo "--- Dernières lignes du log serveur ---"
    tail -n 20 "$TMP_DIR/server.log"
fi

exit "$STATUS"

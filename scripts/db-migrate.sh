#!/usr/bin/env bash
# Apply supabase/migrations/*.sql to your Supabase database in one transaction.
#
# Needs SUPABASE_DB_URL in .env (NOT prefixed with VITE_, so it never reaches the browser):
#   Supabase → Connect → "Session pooler" connection string, with your DB password filled in.
# Uses psql from Docker, so nothing needs installing.
set -euo pipefail
cd "$(dirname "$0")/.."
DB_URL="${SUPABASE_DB_URL:-$(grep -E '^SUPABASE_DB_URL=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || true)}"
if [ -z "$DB_URL" ]; then
  echo "SUPABASE_DB_URL is not set. Add it to .env (see comment at top of this script)." >&2
  exit 1
fi
for f in supabase/migrations/*.sql; do
  echo "Applying $f"
  docker run --rm -i -e PGCONNECT_TIMEOUT=15 postgres:16-alpine \
    psql "$DB_URL" -v ON_ERROR_STOP=1 --single-transaction -q < "$f"
done
echo "Done. Reload the app."

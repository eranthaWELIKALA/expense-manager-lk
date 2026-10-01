#!/usr/bin/env bash
# Applies the migrations to a throwaway Postgres (Docker) and runs the RLS checks.
# The stub stands in for the auth schema/roles Supabase provides.
set -euo pipefail
cd "$(dirname "$0")/.."
NAME=mmp-rls-test
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=pg postgres:16-alpine -c wal_level=logical >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
for _ in $(seq 1 30); do docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
sleep 1
psql_run() { docker exec -i "$NAME" psql -q -U postgres -v ON_ERROR_STOP=1; }
psql_run < supabase/tests/00_supabase_stub.sql
for f in supabase/migrations/*.sql; do psql_run < "$f"; done
out=$(psql_run < supabase/tests/10_rls_test.sql 2>&1) || { echo "$out"; exit 1; }
echo "$out" | grep -E "PASS|FAIL|ALL"
echo "$out" | grep -q "ALL RLS CHECKS PASSED"

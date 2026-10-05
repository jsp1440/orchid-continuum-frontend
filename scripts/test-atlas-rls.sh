#!/usr/bin/env bash
# Proves the OWNER-APPLIED atlas_occurrences locality-protection migration
# against a disposable local Postgres 16 that emulates the Supabase roles, RLS
# and default privileges. Uses SYNTHETIC rows only (open-ocean points) and
# prints PASS lines, booleans and counts — never a coordinate or locality.
#
#   scripts/test-atlas-rls.sh                 run all checks
#   scripts/test-atlas-rls.sh --capture FILE  also write the anon view payload
#                                             (synthetic) to FILE as JSON
#
# Skips (exit 0) when Postgres 16 binaries are absent, unless
# ATLAS_RLS_REQUIRE_PG=1. Never touches any remote database: the cluster
# listens on a Unix socket inside a mktemp directory that is deleted on exit.
# When run as root, the cluster runs as the unprivileged `nobody` user.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
MIG_DIR="$ROOT/docs/atlas-next/migrations"
FIX_DIR="$ROOT/scripts/atlas-rls"
MIGRATION="20260930_atlas_occurrences_locality_protection.sql"
ROLLBACK="20260930_atlas_occurrences_locality_protection_rollback.sql"
VERIFY="20260930_atlas_occurrences_locality_protection_verify.sql"
CAPTURE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --capture) CAPTURE="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [ ! -x "$PG_BIN/initdb" ] || [ ! -x "$PG_BIN/pg_ctl" ] || [ ! -x "$PG_BIN/psql" ]; then
  if [ "${ATLAS_RLS_REQUIRE_PG:-0}" = "1" ]; then
    echo "FAIL: Postgres binaries not found in $PG_BIN" >&2
    exit 1
  fi
  echo "SKIP: Postgres binaries not found in $PG_BIN (set PG_BIN, or ATLAS_RLS_REQUIRE_PG=1 to fail)"
  exit 0
fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/atlas-rls.XXXXXX")"
RUN=()
if [ "$(id -u)" = "0" ]; then
  chown nobody "$WORK"
  RUN=(runuser -u nobody --)
fi
PORT=$(( 54000 + ($$ % 1000) ))
SOCK="$WORK/sock"
SQL="$WORK/sql"
STARTED=0

cleanup() {
  if [ "$STARTED" = "1" ]; then
    "${RUN[@]}" "$PG_BIN/pg_ctl" -D "$WORK/data" -m fast -w stop >/dev/null 2>&1 || true
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT

"${RUN[@]}" mkdir -p "$SOCK" "$SQL"
cp "$MIG_DIR/$MIGRATION" "$MIG_DIR/$ROLLBACK" "$MIG_DIR/$VERIFY" \
   "$FIX_DIR/supabase_emulation.sql" "$FIX_DIR/assertions.sql" \
   "$FIX_DIR/privilege_snapshot.sql" "$FIX_DIR/synthetic_curation.sql" "$SQL/"
if [ "$(id -u)" = "0" ]; then chown -R nobody "$SQL"; fi

"${RUN[@]}" "$PG_BIN/initdb" -D "$WORK/data" -U atlas_super --auth=trust -E UTF8 >/dev/null
"${RUN[@]}" "$PG_BIN/pg_ctl" -D "$WORK/data" -l "$WORK/server.log" -w \
  -o "-k $SOCK -p $PORT -c listen_addresses=''" start >/dev/null
STARTED=1

# psql as a given user against a given database; extra args follow.
pgq() {
  local user="$1" db="$2"; shift 2
  "${RUN[@]}" "$PG_BIN/psql" -X -q -v ON_ERROR_STOP=1 -h "$SOCK" -p "$PORT" -U "$user" -d "$db" "$@"
}
# Keep only PASS/FAIL/SKIP/WARNING notices and psql errors; never data rows.
notices() { grep -E 'PASS|FAIL|SKIP|WARNING|ERROR' || true; }

pass() { echo "PASS: $*"; }
fail() { echo "FAIL: $*" >&2; exit 1; }

fresh_db() {
  pgq atlas_super postgres -c "CREATE DATABASE $1" >/dev/null
  pgq atlas_super "$1" -f "$SQL/supabase_emulation.sql" >/dev/null
}

snapshot() { pgq atlas_super "$1" -At -F '|' -f "$SQL/privilege_snapshot.sql"; }

echo "== atlas_occurrences locality protection: disposable Postgres 16, SYNTHETIC rows =="
fresh_db atlas

# --- Negative control: the harness detects the current leak. -----------------
if pgq atlas_super atlas -f "$SQL/assertions.sql" >/dev/null 2>&1; then
  fail "negative control: assertions passed BEFORE the migration (harness cannot see the leak)"
fi
pgq atlas_super atlas -At -c "SET ROLE anon; SELECT count(*) > 0 FROM public.atlas_occurrences WHERE lat IS NOT NULL" \
  | grep -qx t || fail "negative control: anon could not read raw rows before the migration"
pass "negative control: before the migration anon reads raw coordinates and the assertions fail"

snapshot atlas > "$WORK/before.txt"

# --- Apply, curate, assert, verify. -------------------------------------------
pgq atlas_owner atlas -f "$SQL/$MIGRATION" 2>&1 | notices
pass "migration applied as the table owner (non-superuser, NOBYPASSRLS)"
pgq atlas_owner atlas -f "$SQL/synthetic_curation.sql" >/dev/null
pgq atlas_super atlas -f "$SQL/assertions.sql" 2>&1 | notices
pgq atlas_owner atlas -f "$SQL/$VERIFY" > "$WORK/verify1.txt" 2>&1 \
  || { notices < "$WORK/verify1.txt"; fail "owner verification script failed"; }
notices < "$WORK/verify1.txt"
pass "owner verification script passes"

# --- Idempotency. --------------------------------------------------------------
snapshot atlas > "$WORK/after1.txt"
pgq atlas_owner atlas -f "$SQL/$MIGRATION" 2>&1 | notices
snapshot atlas > "$WORK/after2.txt"
diff -q "$WORK/after1.txt" "$WORK/after2.txt" >/dev/null || fail "re-applying changed the access-control state"
pgq atlas_super atlas -f "$SQL/assertions.sql" >/dev/null 2>&1 || fail "assertions fail after re-applying"
pgq atlas_owner atlas -f "$SQL/$VERIFY" >/dev/null 2>&1 || fail "verification fails after re-applying"
pass "migration is idempotent (identical access state, assertions and verification still pass)"

# --- Optional capture of the anon payload (synthetic). ------------------------
if [ -n "$CAPTURE" ]; then
  pgq atlas_super atlas -At -c "SET ROLE anon; SELECT json_agg(v ORDER BY v.id) FROM public.atlas_occurrences_public v" \
    > "$WORK/capture.json"
  cp "$WORK/capture.json" "$CAPTURE"
  pass "captured the anon view payload (synthetic rows) to $CAPTURE"
fi

# --- Negative control for the verifier: a re-granted leak is caught. ----------
pgq atlas_owner atlas -c "GRANT SELECT ON public.atlas_occurrences TO anon" >/dev/null
if pgq atlas_owner atlas -f "$SQL/$VERIFY" >/dev/null 2>&1; then
  fail "negative control: verification passed with anon re-granted SELECT"
fi
pgq atlas_owner atlas -c "REVOKE SELECT ON public.atlas_occurrences FROM anon" >/dev/null
pass "negative control: verification fails when anon is re-granted raw SELECT"

# --- Rollback restores the previous grants and policy exactly. ----------------
pgq atlas_owner atlas -f "$SQL/$ROLLBACK" 2>&1 | notices
snapshot atlas > "$WORK/rolled.txt"
diff -q "$WORK/before.txt" "$WORK/rolled.txt" >/dev/null || fail "rollback did not restore the pre-migration access state"
pgq atlas_owner atlas -f "$SQL/$ROLLBACK" >/dev/null 2>&1 || fail "rollback is not idempotent"
snapshot atlas > "$WORK/rolled2.txt"
diff -q "$WORK/before.txt" "$WORK/rolled2.txt" >/dev/null || fail "second rollback changed the access state"
pgq atlas_super atlas -At -c "SET ROLE anon; SELECT count(*) > 0 FROM public.atlas_occurrences" \
  | grep -qx t || fail "anon cannot read after rollback (previous grant not restored)"
pass "rollback restores the previous grants and policy exactly, and is idempotent"

# --- Re-apply after rollback. -------------------------------------------------
pgq atlas_owner atlas -f "$SQL/$MIGRATION" >/dev/null 2>&1 || fail "re-apply after rollback failed"
pgq atlas_super atlas -f "$SQL/assertions.sql" >/dev/null 2>&1 || fail "assertions fail after re-apply"
pass "migration re-applies cleanly after rollback"

# --- Precondition: a view owner subject to RLS aborts atomically. -------------
fresh_db atlas_force
pgq atlas_owner atlas_force -c "ALTER TABLE public.atlas_occurrences FORCE ROW LEVEL SECURITY" >/dev/null
snapshot atlas_force > "$WORK/force_before.txt"
if pgq atlas_owner atlas_force -f "$SQL/$MIGRATION" >/dev/null 2>&1; then
  fail "migration applied although the view owner is subject to FORCE RLS"
fi
snapshot atlas_force > "$WORK/force_after.txt"
diff -q "$WORK/force_before.txt" "$WORK/force_after.txt" >/dev/null || fail "aborted migration left partial changes"
pass "precondition: FORCE RLS on the base table aborts the migration with no partial change"

echo "ALL PASS: atlas_occurrences locality protection (synthetic, local Postgres 16)"

#!/usr/bin/env bash
# Start the existing app with its local-only reference identity service.
set -eu
cd "$(dirname "$0")/.."
export REFERENCE_BACKEND_PORT=8791
export VITE_SUPABASE_URL=http://127.0.0.1:8791
export VITE_SUPABASE_ANON_KEY=reference-backend-anon-key
export VITE_CALYX_API_URL=$VITE_SUPABASE_URL
export VITE_ORCHID_CONTINUUM_API_BASE_URL=$VITE_SUPABASE_URL
node e2e/support/reference-backend.mjs &
identity_pid=$!
node_modules/.bin/vite --host 127.0.0.1 --port 4173 --strictPort &
vite_pid=$!
trap 'kill "$identity_pid" "$vite_pid" 2>/dev/null || true' EXIT
trap 'exit 130' INT TERM
wait -n "$identity_pid" "$vite_pid"

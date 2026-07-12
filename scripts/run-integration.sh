#!/usr/bin/env bash
#
# Repeatable integration-test runner (QA / AC-12, AC-13).
#
# Stands the local DB into a known state, then runs the live integration suite:
#   1. `supabase db reset`  -> applies migrations 0001..0005 from scratch
#   2. `npm run db:seed`    -> idempotent seed against the LOCAL instance
#   3. `vitest` (integration config) against the seeded local DB
#
# Requires a running local stack (`npx supabase start`) with Docker up. Uses the
# WELL-KNOWN public local Supabase demo keys (not secrets; localhost only).
set -euo pipefail

cd "$(dirname "$0")/.."

# Well-known local Supabase demo keys (public; only valid against localhost).
export NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321"
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
export SUPABASE_SECRET_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"
export INTEGRATION_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL"

echo "==> Resetting local Supabase (applying migrations 0001..0005)"
npx supabase db reset

echo "==> Seeding local Supabase"
npm run db:seed

echo "==> Running integration suite"
npx vitest run --config vitest.integration.config.ts

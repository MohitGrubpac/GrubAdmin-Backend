#!/usr/bin/env bash
# Run from repo root after sourcing slot .env.production (DATABASE_URL set).
set -euo pipefail

BASELINE_MIGRATION="0001_baseline_schema"
PG_CONFIG="prisma.config.postgres.ts"

is_postgres_url() {
	case "${DATABASE_URL:-}" in
	postgresql://* | postgres://*) return 0 ;;
	*) return 1 ;;
	esac
}

run_migrate_deploy() {
	local config_flag=()
	if is_postgres_url; then
		echo "=== Postgres DATABASE_URL — using ${PG_CONFIG} ==="
		config_flag=(--config "$PG_CONFIG")
		baseline_resolve_if_needed "${config_flag[@]}"
	else
		echo "=== MySQL DATABASE_URL — using default prisma/migrations ==="
	fi

	local success=false
	local i
	for i in 1 2 3; do
		echo "Attempt $i: prisma migrate deploy..."
		if timeout 120 bun prisma migrate deploy "${config_flag[@]}"; then
			success=true
			break
		fi
		echo "migrate deploy failed, waiting 5s before retry..."
		sleep 5
	done
	if [ "$success" != "true" ]; then
		echo "prisma migrate deploy failed after 3 attempts"
		exit 1
	fi
}

baseline_resolve_if_needed() {
	# Phase 2 applied schema via db push; mark baseline applied so deploy is a no-op.
	local applied
	applied="$(bun prisma migrate status "${@}" 2>/dev/null | grep -c 'Database schema is up to date' || true)"
	if [ "${applied:-0}" -gt 0 ]; then
		echo "Postgres migrations already up to date"
		return 0
	fi

	if ! bun prisma migrate status "${@}" 2>&1 | grep -q 'Following migration have not yet been applied'; then
		return 0
	fi

	echo "=== Postgres schema pre-existing (db push) — resolving baseline as applied ==="
	bun prisma migrate resolve --applied "$BASELINE_MIGRATION" "${@}"
}

run_migrate_deploy

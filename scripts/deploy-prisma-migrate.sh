#!/usr/bin/env bash
# Run from repo root after sourcing slot .env.production (DATABASE_URL set).
# Preflight (before PM2 stop): bash scripts/deploy-prisma-migrate.sh --preflight
set -euo pipefail

BASELINE_MIGRATION="0001_baseline_schema"
PG_CONFIG="prisma.config.postgres.ts"

is_postgres_url() {
	case "${DATABASE_URL:-}" in
	postgresql://* | postgres://*) return 0 ;;
	*) return 1 ;;
	esac
}

schema_is_postgresql() {
	grep -q 'provider = "postgresql"' prisma/schema.prisma 2>/dev/null
}

preflight_database_url() {
	if schema_is_postgresql && ! is_postgres_url; then
		echo "NOTE: PostgreSQL schema with MySQL DATABASE_URL — slot not cut over yet; deploy will use prisma/migrations (MySQL)."
		echo "After validation sign-off, point DATABASE_URL to grubadmin_* on grubpac-v2 and PM2 recreate (#18 cutover)."
		return 0
	fi
	if ! schema_is_postgresql && is_postgres_url; then
		echo "FATAL: DATABASE_URL is PostgreSQL but schema.prisma is not postgresql provider."
		exit 1
	fi
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

	local status_out
	status_out="$(bun prisma migrate status "${@}" 2>&1 || true)"
	if ! echo "$status_out" | grep -qE 'not yet been applied|have not yet been applied'; then
		if echo "$status_out" | grep -q 'Database schema is up to date'; then
			return 0
		fi
		# Phase 2 db push left tables but no migration history (P3005 on deploy).
		if echo "$status_out" | grep -qE 'P3005|schema is not empty'; then
			echo "=== Postgres non-empty DB without migration history — resolving baseline ==="
			bun prisma migrate resolve --applied "$BASELINE_MIGRATION" "${@}"
			return 0
		fi
		return 0
	fi

	echo "=== Postgres schema pre-existing (db push) — resolving baseline as applied ==="
	bun prisma migrate resolve --applied "$BASELINE_MIGRATION" "${@}"
}

if [ "${1:-}" = "--preflight" ]; then
	preflight_database_url
	echo "Preflight OK: DATABASE_URL matches schema provider"
	exit 0
fi

preflight_database_url
run_migrate_deploy

#!/usr/bin/env bash
set -euo pipefail

STATE_FILE="/var/lib/grubadmin/active-prod-backend.color"
OUTPUT_DIR="/var/lib/node_exporter/textfile_collector"
OUTPUT_FILE="${OUTPUT_DIR}/grubadmin_active_slot.prom"

if [[ ! -r "$STATE_FILE" ]]; then
  echo "Cannot read production blue-green state: $STATE_FILE" >&2
  exit 1
fi

active_slot="$(tr -d '[:space:]' < "$STATE_FILE")"
if [[ "$active_slot" != "blue" && "$active_slot" != "green" ]]; then
  echo "Unexpected production blue-green state value" >&2
  exit 1
fi

install -d -m 0755 "$OUTPUT_DIR"
tmp_file="$(mktemp "${OUTPUT_DIR}/.grubadmin_active_slot.XXXXXX")"
trap 'rm -f -- "$tmp_file"' EXIT

if [[ "$active_slot" == "blue" ]]; then
  blue_value=1
  green_value=0
else
  blue_value=0
  green_value=1
fi

{
  printf '# HELP grubadmin_active_slot Active production slot read from the blue-green state file.\n'
  printf '# TYPE grubadmin_active_slot gauge\n'
  printf 'grubadmin_active_slot{deployment_slot="blue"} %s\n' "$blue_value"
  printf 'grubadmin_active_slot{deployment_slot="green"} %s\n' "$green_value"
} > "$tmp_file"

chmod 0644 "$tmp_file"
mv -f -- "$tmp_file" "$OUTPUT_FILE"
trap - EXIT

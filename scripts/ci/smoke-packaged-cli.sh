#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PACKAGE_DIR="$ROOT_DIR/packages/ng-xray"
FIXTURE_ROOT="$PACKAGE_DIR/src/__fixtures__"
TMP_DIR="$(mktemp -d)"
INSTALL_DIR="$TMP_DIR/install"

cleanup() {
  rm -rf "$TMP_DIR"
}

trap cleanup EXIT

copy_fixture() {
  local source_name="$1"
  local target_dir="$TMP_DIR/$2"
  cp -R "$FIXTURE_ROOT/$source_name" "$target_dir"
  printf '%s' "$target_dir"
}

run_expect_exit() {
  local expected_exit="$1"
  shift

  set +e
  "$@"
  local actual_exit=$?
  set -e

  if [[ "$actual_exit" -ne "$expected_exit" ]]; then
    echo "Expected exit code $expected_exit but got $actual_exit for: $*" >&2
    exit 1
  fi
}

echo "Packing ng-xray..."
pnpm --dir "$ROOT_DIR" build >/dev/null
(cd "$PACKAGE_DIR" && npm pack --pack-destination "$TMP_DIR" >/dev/null)
TARBALL="$(printf '%s\n' "$TMP_DIR"/ng-xray-*.tgz)"

mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"
npm init -y >/dev/null 2>&1
npm install "$TARBALL" >/dev/null 2>&1

BIN="./node_modules/.bin/ng-xray"

JSON_FIXTURE="$(copy_fixture full-project full-project-json)"
"$BIN" "$JSON_FIXTURE" --json > "$TMP_DIR/result.json"
node -e "const fs=require('node:fs'); const data=JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); if (data.scanStatus !== 'complete') process.exit(1); if (typeof data.score?.overall !== 'number') process.exit(1);" "$TMP_DIR/result.json"
[[ ! -e "$JSON_FIXTURE/.ng-xray" ]]
[[ ! -e "$JSON_FIXTURE/.ng-xray-baseline.json" ]]

SARIF_FIXTURE="$(copy_fixture full-project full-project-sarif)"
"$BIN" "$SARIF_FIXTURE" --sarif > "$TMP_DIR/result.sarif"
node -e "const fs=require('node:fs'); const data=JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); if (data.version !== '2.1.0') process.exit(1); if (data.runs?.[0]?.properties?.scanStatus !== 'complete') process.exit(1);" "$TMP_DIR/result.sarif"
[[ ! -e "$SARIF_FIXTURE/.ng-xray" ]]

PR_FIXTURE="$(copy_fixture full-project full-project-pr)"
"$BIN" "$PR_FIXTURE" --pr-summary > "$TMP_DIR/summary.md"
node -e "const fs=require('node:fs'); const text=fs.readFileSync(process.argv[1], 'utf8'); if (!text.includes('## ng-xray Health Report')) process.exit(1);" "$TMP_DIR/summary.md"
[[ ! -e "$PR_FIXTURE/.ng-xray" ]]

FAIL_UNDER_FIXTURE="$(copy_fixture full-project fail-under)"
run_expect_exit 3 "$BIN" "$FAIL_UNDER_FIXTURE" --fail-under 101 > /dev/null

PARTIAL_FIXTURE="$(copy_fixture partial-scan-eslint-config partial-scan)"
run_expect_exit 2 "$BIN" "$PARTIAL_FIXTURE" --json > "$TMP_DIR/partial.json"
node -e "const fs=require('node:fs'); const data=JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); if (data.scanStatus !== 'partial') process.exit(1); if (!Array.isArray(data.failedAnalyzers) || data.failedAnalyzers.length === 0) process.exit(1);" "$TMP_DIR/partial.json"

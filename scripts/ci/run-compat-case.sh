#!/usr/bin/env bash

set -euo pipefail

CASE_NAME="${1:?usage: run-compat-case.sh <case-name>}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PACKAGE_DIR="$ROOT_DIR/packages/ng-xray"
TMP_DIR="$(mktemp -d)"
INSTALL_DIR="$TMP_DIR/install"

cleanup() {
  rm -rf "$TMP_DIR"
}

trap cleanup EXIT

export NG_CLI_ANALYTICS=false
export CI=true

pack_cli() {
  pnpm --dir "$ROOT_DIR" build >/dev/null
  (cd "$PACKAGE_DIR" && npm pack --pack-destination "$TMP_DIR" >/dev/null)

  local tarball
  tarball="$(printf '%s\n' "$TMP_DIR"/ng-xray-*.tgz)"

  mkdir -p "$INSTALL_DIR"
  (
    cd "$INSTALL_DIR"
    npm init -y >/dev/null 2>&1
    npm install "$tarball" >/dev/null 2>&1
  )
}

create_app() {
  local angular_version="$1"
  local name="$2"
  shift 2

  (
    cd "$TMP_DIR"
    npx -y @angular/cli@"$angular_version" new "$name" \
      --skip-git \
      --defaults \
      --package-manager npm \
      --style css \
      "$@" \
      >/dev/null
  )

  printf '%s' "$TMP_DIR/$name"
}

create_workspace() {
  local angular_version="$1"
  local name="$2"

  (
    cd "$TMP_DIR"
    npx -y @angular/cli@"$angular_version" new "$name" \
      --no-create-application \
      --skip-git \
      --defaults \
      --package-manager npm \
      --style css \
      >/dev/null
  )

  printf '%s' "$TMP_DIR/$name"
}

run_scan() {
  local target_dir="$1"
  local expected_major="$2"
  shift 2

  local output_file
  output_file="$TMP_DIR/${CASE_NAME}.json"

  "$INSTALL_DIR/node_modules/.bin/ng-xray" "$target_dir" --json "$@" > "$output_file"

  node -e "
    const fs = require('node:fs');
    const data = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
    const expectedMajor = process.argv[2];
    if (data.scanStatus !== 'complete') process.exit(1);
    if (!String(data.project?.angularVersion || '').startsWith(expectedMajor + '.')) process.exit(1);
    if (typeof data.score?.overall !== 'number') process.exit(1);
    if (!Array.isArray(data.diagnostics)) process.exit(1);
  " "$output_file" "$expected_major"
}

pack_cli

case "$CASE_NAME" in
  angular15-legacy-app)
    project_dir="$(create_app 15 angular15-legacy-app)"
    run_scan "$project_dir" 15
    ;;
  angular17-standalone-app)
    project_dir="$(create_app 17 angular17-standalone-app --standalone=true)"
    run_scan "$project_dir" 17
    ;;
  angular19-standalone-app)
    project_dir="$(create_app 19 angular19-standalone-app --standalone=true)"
    run_scan "$project_dir" 19
    ;;
  angular21-standalone-app)
    project_dir="$(create_app 21 angular21-standalone-app --standalone=true)"
    run_scan "$project_dir" 21
    ;;
  angular19-workspace-app)
    workspace_dir="$(create_workspace 19 angular19-workspace-app)"
    (
      cd "$workspace_dir"
      npx ng generate application admin --standalone=true --routing=false --style=css >/dev/null
    )
    run_scan "$workspace_dir" 19 --project admin
    ;;
  angular19-nx-shaped-workspace)
    workspace_dir="$(create_workspace 19 angular19-nx-shaped-workspace)"
    (
      cd "$workspace_dir"
      npx ng generate application admin --standalone=true --routing=false --style=css >/dev/null
    )
    printf '{\n  "npmScope": "compat"\n}\n' > "$workspace_dir/nx.json"
    run_scan "$workspace_dir" 19 --project admin
    ;;
  angular19-library)
    workspace_dir="$(create_workspace 19 angular19-library)"
    (
      cd "$workspace_dir"
      npx ng generate library ui >/dev/null
    )
    run_scan "$workspace_dir" 19 --project ui
    ;;
  *)
    echo "Unknown compatibility case: $CASE_NAME" >&2
    exit 1
    ;;
esac

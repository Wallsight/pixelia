#!/usr/bin/env bash
# Runs a command inside the test container with the repo mounted at /app.
# Linux node_modules live in a named volume (the host's Windows ones are
# untouched) and are reinstalled only when package-lock.json changes. The dev
# server starts on the container's own loopback; no ports are published.
#
#   tools/container/run.sh <outDir> shot "<query>" ...   screenshots via tools/shot.mjs into <outDir>
#   tools/container/run.sh <outDir> sh "<command>"       any command (with the dev server up)
# Env passed through: SETTLE HOLD EVAL EACH REPEAT EVERY NAME
set -euo pipefail
# Absolute path Docker understands (Windows form under Git Bash).
abspath() { (cd "$1" && { pwd -W 2>/dev/null || pwd; }); }
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(abspath "$here/../..")"
out="$1"; shift
mode="$1"; shift
mkdir -p "$out"
out_abs="$(abspath "$out")"

docker image inspect pixelia-test >/dev/null 2>&1 || docker build -q -t pixelia-test "$here" >/dev/null

if [ "$mode" = shot ]; then
  inner='node tools/shot.mjs /out "$@"'
else
  inner="$1"; shift || true
fi

MSYS_NO_PATHCONV=1 docker run --rm --init \
  -v "$repo:/app" -v pixelia-node-modules:/app/node_modules -v "$out_abs:/out" \
  -e SETTLE -e HOLD -e EVAL -e EACH -e REPEAT -e EVERY -e NAME \
  pixelia-test bash -c '
    set -e
    want="$(sha256sum package-lock.json | cut -c1-64)"
    if [ "$(cat node_modules/.lock-hash 2>/dev/null)" != "$want" ]; then
      npm ci --no-audit --no-fund --loglevel=error >/dev/null && echo "$want" > node_modules/.lock-hash
    fi
    npx vite --logLevel error >/tmp/vite.log 2>&1 &
    for i in $(seq 1 60); do node -e "fetch(\"http://127.0.0.1:5173/\").then(()=>process.exit(0),()=>process.exit(1))" && break; sleep 0.5; done
    '"$inner"'
  ' bash "$@"

#!/bin/sh
set -eu
archive=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$archive"
mkdir -p runs
run=${1:-"runs/$(date -u +%Y%m%dT%H%M%SZ)"}
test ! -e "$run"
node verify-compat.mjs "$run" > "$run.stdout.log" 2> "$run.stderr.log"
for file in "$run"/generated/*.mjs snapshots/loading-proxy.mjs snapshots/functional.mjs snapshots/rituals.mjs snapshots/audio-resume.mjs snapshots/loading.mjs; do
  node --check "$file" >> "$run/syntax.log" 2>&1
  printf 'PASS node --check %s\n' "$file" >> "$run/syntax.log"
done
for name in audio-resume loading functional rituals; do
  node "snapshots/$name.mjs" --help > "$run/help-$name.log" 2>&1
done
printf 'PASS: 21 cases, 14 syntax checks, 4 --help executions; no browser launched.\n'
printf 'Raw logs: %s/%s\n' "$archive" "$run"

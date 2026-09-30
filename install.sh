#!/usr/bin/env bash
# Link every extension in this repo into a project's .pi/extensions/ directory.
# Usage: ./install.sh /path/to/project

set -euo pipefail

PROJECT="${1:?Usage: ./install.sh /path/to/project}"
HERE="$(cd "$(dirname "$0")" && pwd)"

DEST="$PROJECT/.pi/extensions"
mkdir -p "$DEST"

for ext in "$HERE"/*.ts; do
	name="$(basename "$ext")"
	ln -sf "$ext" "$DEST/$name"
	echo "linked $DEST/$name -> $ext"
done

echo "Done. Run /reload inside Pi, and trust the project if prompted."

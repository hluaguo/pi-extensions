#!/usr/bin/env bash
# Selective installer for the pi-extensions hub.
#
# Usage:
#   ./install.sh --list                              # show available extensions
#   ./install.sh /path/to/project arxiv obsidian     # install chosen extensions
#   ./install.sh /path/to/project --all              # install everything
#
# Each extension lives in extensions/<name>.ts and is symlinked into
# <project>/.pi/extensions/<name>.ts. Pi loads project extensions from
# .pi/extensions/ after you run /reload inside Pi.

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
EXT_DIR="$HERE/extensions"

list_extensions() {
	echo "Available extensions:"
	for f in "$EXT_DIR"/*.ts; do
		echo "  $(basename "$f" .ts)"
	done
}

if [ "${1:-}" = "--list" ] || [ "${1:-}" = "-l" ]; then
	list_extensions
	exit 0
fi

PROJECT="${1:?Usage: ./install.sh /path/to/project <extension...>|--all  (run with --list to see what exists)}"
shift

NAMES=("$@")
if [ "${NAMES[0]:-}" = "--all" ]; then
	NAMES=()
	for f in "$EXT_DIR"/*.ts; do
		NAMES+=("$(basename "$f" .ts)")
	done
fi

if [ "${#NAMES[@]}" -eq 0 ]; then
	echo "No extension names given." >&2
	list_extensions >&2
	exit 1
fi

DEST="$PROJECT/.pi/extensions"
mkdir -p "$DEST"

for name in "${NAMES[@]}"; do
	src="$EXT_DIR/$name.ts"
	if [ ! -f "$src" ]; then
		echo "Unknown extension: $name" >&2
		list_extensions >&2
		exit 1
	fi
	ln -sf "$src" "$DEST/$name.ts"
	echo "linked $DEST/$name.ts -> $src"
done

echo "Done. Run /reload inside Pi, and trust the project if prompted."

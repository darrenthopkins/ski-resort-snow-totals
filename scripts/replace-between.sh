#!/usr/bin/env bash
set -euo pipefail

# Replaces content in a file between two marker lines (inclusive) with a replacement block.
# Reads replacement block from stdin by default, or from clipboard via --pbpaste.

usage() {
  cat <<'EOF'
Usage:
  ./scripts/replace-between.sh --file path --start 'literal start line' --end 'literal end line'
                              [--pbpaste] [--out path] [--backup] [--dry-run]

Examples:
  ./scripts/replace-between.sh --file src/pages/Snow.tsx \
    --start '{(() => {' --end '})()}' --pbpaste --backup

  cat replacement.txt | ./scripts/replace-between.sh --file src/pages/Snow.tsx \
    --start '{(() => {' --end '})()}' --backup
EOF
}

FILE=""
START=""
END=""
USE_PBPASTE=0
DO_BACKUP=0
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --file) FILE="${2:-}"; shift 2;;
    --start) START="${2:-}"; shift 2;;
    --end) END="${2:-}"; shift 2;;
    --pbpaste) USE_PBPASTE=1; shift;;
    --backup) DO_BACKUP=1; shift;;
    --dry-run) DRY_RUN=1; shift;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown arg: $1" >&2; usage; exit 2;;
  esac
done

[[ -n "$FILE" && -n "$START" && -n "$END" ]] || { echo "Missing required args." >&2; usage; exit 2; }
[[ -f "$FILE" ]] || { echo "File not found: $FILE" >&2; exit 1; }

tmp="$(mktemp)"
rep="$(mktemp)"

if [[ $USE_PBPASTE -eq 1 ]]; then
  command -v pbpaste >/dev/null 2>&1 || { echo "pbpaste not found" >&2; exit 1; }
  pbpaste > "$rep"
else
  cat > "$rep"
fi

# Basic sanity: replacement should include START and END? (we don't require it; we inject raw)
if [[ ! -s "$rep" ]]; then
  echo "Replacement is empty." >&2
  exit 1
fi

# Backup
if [[ $DO_BACKUP -eq 1 ]]; then
  cp "$FILE" "${FILE}.bak.$(date +%Y%m%d_%H%M%S)"
fi

# Use awk to replace the first matching region (inclusive)
awk -v start="$START" -v end="$END" -v repfile="$rep" '
  BEGIN { inblock=0; replaced=0; }
  {
    if (!replaced && $0 == start) {
      inblock=1;
      replaced=1;
      # print replacement file instead of original block
      while ((getline line < repfile) > 0) print line;
      close(repfile);
      next;
    }
    if (inblock) {
      if ($0 == end) { inblock=0; next; }
      next;
    }
    print;
  }
  END {
    if (replaced==0) {
      print "ERROR: start marker not found exactly: " start > "/dev/stderr";
      exit 3;
    }
  }
' "$FILE" > "$tmp"

if [[ $DRY_RUN -eq 1 ]]; then
  echo "Dry run complete. Output at: $tmp"
  exit 0
fi

mv "$tmp" "$FILE"
rm -f "$rep"
echo "Replaced region in $FILE"

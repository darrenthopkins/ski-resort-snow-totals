#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Replace a region in a file between start/end marker lines (inclusive) with a replacement block.

Input:
  - default: reads replacement from stdin (paste, then Ctrl-D)
  - --pbpaste: reads replacement from clipboard (macOS)
  - --file-repl PATH: reads replacement from a file

Matching:
  - default: exact match on the full line (including whitespace)
  - --trim: match after trimming leading/trailing whitespace
  - --nth N: replace the Nth occurrence of the (start..end) region (default 1)

Safety:
  - --backup: save a timestamped .bak copy of the target file
  - --dry-run: do not modify file; print a unified diff

Usage:
  ./scripts/replace-between.sh --file path --start '...' --end '...' [--pbpaste|--file-repl PATH] [--trim] [--nth N] [--backup] [--dry-run]
EOF
}

FILE=""
START=""
END=""
USE_PBPASTE=0
REPL_FILE=""
DO_BACKUP=0
DRY_RUN=0
TRIM=0
NTH=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --file) FILE="${2:-}"; shift 2;;
    --start) START="${2:-}"; shift 2;;
    --end) END="${2:-}"; shift 2;;
    --pbpaste) USE_PBPASTE=1; shift;;
    --file-repl) REPL_FILE="${2:-}"; shift 2;;
    --backup) DO_BACKUP=1; shift;;
    --dry-run) DRY_RUN=1; shift;;
    --trim) TRIM=1; shift;;
    --nth) NTH="${2:-}"; shift 2;;
    -h|--help) usage; exit 0;;
    *) echo "Unknown arg: $1" >&2; usage; exit 2;;
  esac
done

[[ -n "$FILE" && -n "$START" && -n "$END" ]] || { echo "Missing required args." >&2; usage; exit 2; }
[[ -f "$FILE" ]] || { echo "File not found: $FILE" >&2; exit 1; }
[[ "$NTH" =~ ^[0-9]+$ ]] || { echo "--nth must be an integer" >&2; exit 2; }
[[ "$NTH" -ge 1 ]] || { echo "--nth must be >= 1" >&2; exit 2; }

if [[ $USE_PBPASTE -eq 1 && -n "$REPL_FILE" ]]; then
  echo "Error: choose only one replacement source: --pbpaste OR --file-repl OR stdin" >&2
  exit 2
fi

tmp_out="$(mktemp)"
tmp_rep="$(mktemp)"

# Read replacement
if [[ -n "$REPL_FILE" ]]; then
  [[ -f "$REPL_FILE" ]] || { echo "Replacement file not found: $REPL_FILE" >&2; exit 1; }
  cat "$REPL_FILE" > "$tmp_rep"
elif [[ $USE_PBPASTE -eq 1 ]]; then
  command -v pbpaste >/dev/null 2>&1 || { echo "pbpaste not found (macOS only)" >&2; exit 1; }
  pbpaste > "$tmp_rep"
else
  if [[ -t 0 ]]; then
    echo "Paste replacement block now. End with Ctrl-D."
  fi
  cat > "$tmp_rep"
fi

# Strip markdown fences if present
tmp_rep2="$(mktemp)"
grep -vE '^\s*```(tsx|ts|diff)?\s*$' "$tmp_rep" > "$tmp_rep2" || true
mv "$tmp_rep2" "$tmp_rep"

if [[ ! -s "$tmp_rep" ]]; then
  echo "Replacement is empty." >&2
  exit 1
fi

# Backup
if [[ $DO_BACKUP -eq 1 ]]; then
  cp "$FILE" "${FILE}.bak.$(date +%Y%m%d_%H%M%S)"
fi

awk -v start="$START" -v end="$END" -v repfile="$tmp_rep" -v trim="$TRIM" -v nth="$NTH" '
  function ltrim(s) { sub(/^[ \t\r\n]+/, "", s); return s }
  function rtrim(s) { sub(/[ \t\r\n]+$/, "", s); return s }
  function t(s) { return rtrim(ltrim(s)) }

  BEGIN { inblock=0; replaced=0; seen=0; }

  {
    line = $0
    cmp = (trim==1 ? t(line) : line)
    s_cmp = (trim==1 ? t(start) : start)
    e_cmp = (trim==1 ? t(end) : end)

    if (!inblock && cmp == s_cmp) {
      seen++
      if (seen == nth) {
        inblock=1
        replaced=1
        while ((getline r < repfile) > 0) print r
        close(repfile)
        next
      }
    }

    if (inblock) {
      if (cmp == e_cmp) { inblock=0; next }
      next
    }

    print line
  }

  END {
    if (seen == 0) { print "ERROR: start marker not found" > "/dev/stderr"; exit 3 }
    if (seen < nth) { print "ERROR: start marker found " seen " time(s), but --nth=" nth " requested" > "/dev/stderr"; exit 4 }
    if (replaced==0) { print "ERROR: did not replace region" > "/dev/stderr"; exit 5 }
  }
' "$FILE" > "$tmp_out"

if [[ $DRY_RUN -eq 1 ]]; then
  echo "----- DRY RUN DIFF (no files changed) -----"
  diff -u "$FILE" "$tmp_out" || true
  rm -f "$tmp_out" "$tmp_rep"
  exit 0
fi

mv "$tmp_out" "$FILE"
rm -f "$tmp_rep"
echo "Replaced region in $FILE"

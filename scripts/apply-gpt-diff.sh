#!/usr/bin/env bash
set -euo pipefail

REQUIRE_BRANCH="feature/hero-ux"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/apply-gpt-diff.sh [-m "commit message"] [--no-build] [--no-commit]
                             [--any-branch] [--pbpaste] [--file path.patch]

Modes (choose ONE input source):
  - Default: reads patch from STDIN (paste, then Ctrl-D)
  - --pbpaste: reads patch from macOS clipboard (pbpaste)
  - --file <path>: reads patch from file

What it does:
  - Enforces REQUIRE_BRANCH unless --any-branch
  - Saves the patch to .gpt_patches/<timestamp>.patch
  - Strips markdown code fences (```diff ... ```)
  - Validates *real* unified diff hunks
  - git apply --index (stages)
  - optionally npm run build
  - optionally git commit

Examples:
  ./scripts/apply-gpt-diff.sh -m "Hero UX update"
  ./scripts/apply-gpt-diff.sh --pbpaste -m "Hero UX update"
  ./scripts/apply-gpt-diff.sh --file .gpt_patches/foo.patch --no-commit
  ./scripts/apply-gpt-diff.sh --any-branch --no-build --no-commit
EOF
}

COMMIT_MSG=""
DO_BUILD=1
DO_COMMIT=1
ALLOW_ANY_BRANCH=0
FROM_CLIPBOARD=0
FROM_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -m|--message)
      COMMIT_MSG="${2:-}"
      shift 2
      ;;
    --no-build)
      DO_BUILD=0
      shift
      ;;
    --no-commit)
      DO_COMMIT=0
      shift
      ;;
    --any-branch)
      ALLOW_ANY_BRANCH=1
      shift
      ;;
    --pbpaste)
      FROM_CLIPBOARD=1
      shift
      ;;
    --file)
      FROM_FILE="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      usage
      exit 2
      ;;
  esac
done

# If no commit message, do not commit.
if [[ -z "${COMMIT_MSG}" ]]; then
  DO_COMMIT=0
fi

# Ensure git repo.
git rev-parse --show-toplevel >/dev/null 2>&1 || { echo "Error: not in a git repo" >&2; exit 1; }

# Branch enforcement.
cur_branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "${ALLOW_ANY_BRANCH}" -ne 1 && "${cur_branch}" != "${REQUIRE_BRANCH}" ]]; then
  echo "Error: current branch is '${cur_branch}', expected '${REQUIRE_BRANCH}'." >&2
  echo "Tip: git checkout ${REQUIRE_BRANCH}  (or pass --any-branch)" >&2
  exit 1
fi

# Input mode sanity: only one of stdin/clipboard/file.
if [[ "${FROM_CLIPBOARD}" -eq 1 && -n "${FROM_FILE}" ]]; then
  echo "Error: choose only one input mode: --pbpaste OR --file OR stdin" >&2
  exit 2
fi

mkdir -p .gpt_patches
ts="$(date +%Y%m%d_%H%M%S)"
patch_path=".gpt_patches/${ts}.patch"

# Read patch content.
if [[ -n "${FROM_FILE}" ]]; then
  if [[ ! -f "${FROM_FILE}" ]]; then
    echo "Error: --file not found: ${FROM_FILE}" >&2
    exit 1
  fi
  cat "${FROM_FILE}" > "${patch_path}"
elif [[ "${FROM_CLIPBOARD}" -eq 1 ]]; then
  command -v pbpaste >/dev/null 2>&1 || { echo "Error: pbpaste not found (macOS only)" >&2; exit 1; }
  pbpaste > "${patch_path}"
else
  # STDIN mode: must be interactive terminal (optional, but prevents confusion)
  if [[ -t 0 ]]; then
    echo "Paste unified diff now. End with Ctrl-D."
  fi
  cat > "${patch_path}"
fi

# Normalize: strip markdown code fences.
# Remove lines that are exactly ``` or start with ```diff
tmp="${patch_path}.tmp"
grep -vE '^\s*```(diff)?\s*$' "${patch_path}" > "${tmp}" || true
mv "${tmp}" "${patch_path}"

# Basic validations
if ! grep -q '^diff --git ' "${patch_path}"; then
  echo "Error: patch missing 'diff --git' header. You likely pasted only a fragment." >&2
  echo "Saved at: ${patch_path}" >&2
  exit 1
fi

# Validate hunks are real unified diff hunks.
# Accepts: @@ -12,7 +12,9 @@  OR @@ -12 +12 @@
if ! grep -Eq '^@@ -[0-9]+(,[0-9]+)? \+[0-9]+(,[0-9]+)? @@' "${patch_path}"; then
  echo "Error: patch missing VALID hunk headers." >&2
  echo "Expected something like: @@ -123,7 +123,9 @@ (not just '@@')." >&2
  echo "Saved at: ${patch_path}" >&2
  exit 1
fi

# Apply the patch
if git apply --index "${patch_path}"; then
  echo "Patch applied and staged."
else
  echo "git apply failed. Retrying with --reject --whitespace=fix ..." >&2
  git apply --reject --whitespace=fix "${patch_path}" || {
    echo "Error: patch still failed. Look for *.rej files and apply those hunks manually." >&2
    echo "----- Patch head (debug) -----" >&2
    sed -n '1,120p' "${patch_path}" >&2
    echo "Patch saved at: ${patch_path}" >&2
    exit 1
  }
  echo "Applied with rejects. NOTE: you must stage changes manually before committing."
fi

# Build (optional)
if [[ $DO_BUILD -eq 1 && -f package.json ]]; then
  echo "Running: npm run build"
  npm run build
else
  echo "Skipping build."
fi

# Commit (optional)
if [[ $DO_COMMIT -eq 1 ]]; then
  if git diff --cached --name-only | grep -q .; then
    git commit -m "${COMMIT_MSG}"
    echo "Committed: ${COMMIT_MSG}"
  else
    echo "No staged changes to commit (maybe reject-mode). Stage then commit manually." >&2
    exit 1
  fi
else
  echo "Not committing."
fi

echo "Done."

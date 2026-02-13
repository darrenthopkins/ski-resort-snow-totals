#!/usr/bin/env bash
set -euo pipefail

bad_paths=$(git diff --cached --name-only | rg -n '^(\\.dd/|DerivedData/|ios/App/Pods/|.*\\.xcresult$|.*xcuserdata/)' || true)

if [[ -n "${bad_paths}" ]]; then
  echo "ERROR: Derived/build artifacts staged for commit:"
  echo "${bad_paths}"
  echo
  echo "Fix: git rm --cached -r .dd DerivedData ios/App/Pods || true"
  exit 1
fi


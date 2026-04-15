#!/usr/bin/env bash
# Usage: ./scripts/untrack-config.sh config/links.json config/seo.json
# This script removes files from git tracking (git rm --cached) so they remain local only.
# It will not delete the files from disk; it stages the removal for commit.

set -euo pipefail
if ! command -v git >/dev/null 2>&1; then
  echo "git not found"
  exit 1
fi

if [ "$#" -eq 0 ]; then
  echo "Provide one or more config files to untrack, e.g.:"
  echo "  $0 config/links.json config/seo.json"
  exit 1
fi

for f in "$@"; do
  if [ ! -f "$f" ]; then
    echo "File not found: $f -- skipping"
    continue
  fi
  echo "git rm --cached $f"
  git rm --cached "$f" || true
done

echo "Done. Review changes and commit: git commit -m 'Untrack local config files'"

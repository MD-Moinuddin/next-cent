#!/usr/bin/env bash
pattern='^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-z0-9-]+\))?!?: .{1,100}$'
first_line=$(head -n1 "$1")
if ! [[ "$first_line" =~ $pattern ]]; then
  echo "Commit message must follow Conventional Commits, e.g. 'feat(api): add categories'"
  exit 1
fi

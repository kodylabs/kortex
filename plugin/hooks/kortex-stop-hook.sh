#!/bin/sh
STAMP="$HOME/.kortex-last-stop"
NOW=$(date +%s)

if [ -f "$STAMP" ]; then
  LAST=$(cat "$STAMP" 2>/dev/null || echo 0)
  if [ $((NOW - LAST)) -lt 300 ]; then
    exit 0
  fi
fi

echo "$NOW" > "$STAMP"
echo "KORTEX: Before closing, check if this session contains anything worth persisting — architecture decisions, solutions to hard problems, important project context. If yes, call save_memory with appropriate project and tags. If nothing relevant, ignore this message." >&2
exit 2

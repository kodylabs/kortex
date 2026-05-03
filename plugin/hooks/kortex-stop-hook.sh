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
echo "KORTEX: Before closing, check whether this session produced anything worth keeping in the shared KB — an architecture decision, a non-obvious fix, durable project context. If so: search first; prefer update_note on an existing related note over create_note; only create if no related note exists. Most sessions yield nothing — ignoring is a valid answer." >&2
exit 2

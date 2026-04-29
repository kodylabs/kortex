---
name: kortex
description: "Proactive memory tools — call save_memory to persist knowledge, search to retrieve context. Use when working on known projects or discussing architecture decisions."
---

# Kortex — Semantic memory

You have access to a local knowledge base via the MCP tools `save_memory`, `search`, `get_context`, `recent`, `list_notes`.

## When to save (call save_memory)

- Non-trivial architecture or design decision
- Pattern or solution to a difficult problem
- Project context important for future sessions
- Personal note or idea the user wants to keep

## When to search (call search)

- Before answering a question that may have been addressed before
- When the user mentions a project or concept without context
- At the start of a session on a known project

## Do not save

- Trivial or temporary code
- Information already present in the source code
- Things only relevant to the current session

## Useful parameters

- `project`: routes the note to `projects/<project>/` — use whenever working on a named project
- `tags`: e.g. `["architecture", "decision"]`, `["bug", "fix"]`, `["personal"]`
- `title`: auto-generated if absent (first words of content)

# kortex

A shared knowledge base — co-written by you and your LLM, queryable by both.

## The idea

Most "AI memory" systems treat memory as something *the assistant manages on your behalf*: opaque, append-only, hidden behind an API. Kortex flips that. The knowledge base is a plain Obsidian vault on your disk. Both sides — you in Obsidian, Claude through MCP — read and write to it as equals.

- **You** write notes the way you always have. Claude can find them by meaning.
- **Claude** persists what it learns from your sessions (architecture decisions, hard-won fixes, project context) directly into the same vault.
- **You** review, edit, refactor, or delete those notes in Obsidian. The next session sees your edits.

The result is a knowledge base that both parties grow over time — not a transcript, not a black box, but a living document you actually own.

## Why not just use Claude's built-in memory?

Claude Code already has a per-project auto-memory system. Kortex is for what that doesn't cover:

| Need | auto-memory | kortex |
|---|---|---|
| Loaded into every session | yes (full context cost) | no — pulled on demand via semantic search |
| Editable in your normal tools | files, but format is dictated | plain markdown in Obsidian |
| Cross-project recall | no | yes — search spans the whole vault |
| Survives reinstalls / syncs across machines | bound to Claude's storage | it's just a folder of `.md` files |
| Linkable, taggable, browsable as a graph | no | Obsidian-native |

If your knowledge fits in a per-project memory file, you don't need kortex. If it doesn't — if it's the kind of thing you'd actually want in your second brain — kortex is the bridge.

## How it works

```
You ─────────► ~/kortex-kb/  ◄───────── Claude (via MCP)
   edit in       *.md notes         CRUD + search
   Obsidian   (source of truth)
                       │
                       ▼
                file watcher
                       │
                       ▼
            SQLite + sqlite-vec
            (semantic index, rebuilt
             on hash change)
```

When Claude Code starts, kortex's MCP server launches automatically (declared in `.mcp.json`). It exposes:

| Tool | Purpose |
|---|---|
| `create_note` | Create a new note: writes a `.md` file to the vault, indexes it |
| `read_note` | Fetch a note's full content + frontmatter |
| `update_note` | Edit content/tags/project of an agent-authored note (also moves via `new_filepath`) |
| `delete_note` | Remove an agent-authored note |
| `search` | Semantic search (sqlite-vec via local ollama) with FTS5 keyword fallback |
| `get_context` | Pulls the project's `hot.md` summary + recent notes |
| `recent`, `list_notes`, `status`, `sync` | Browse, inspect, force re-index |

### Authorship boundary

Every note Claude writes carries `author: agent` in its frontmatter. The file watcher flips `human_edited: true` the moment you touch a note in Obsidian. `update_note` and `delete_note` refuse to act on any note that wasn't agent-authored, or that you've curated since — so Claude can self-manage its own scribbles without ever touching what you wrote or refined.

Embeddings are generated locally via ollama (`nomic-embed-text`, 768-dim). If ollama is offline, keyword search (FTS5) takes over so the system never blocks.

### Index sync

The index stays current through three mechanisms:

| Trigger | What happens |
|---|---|
| Server startup | Full vault scan — re-indexes any file whose SHA-256 hash changed |
| chokidar watcher | Real-time: `add`/`change`/`unlink` propagated immediately |
| Periodic timer | Full scan every 30 minutes as a safety net |
| `sync` tool | Manual trigger from inside a session |

Hash diffing means unchanged files are skipped. Editing notes in Obsidian, deleting them, or syncing the vault from another machine — all of it is picked up automatically.

Ignored paths inside the vault: `.knowledge/` (the SQLite index lives here) and `hot.md` (auto-regenerated).

## Installation

**1. Bun**
```sh
curl -fsSL https://bun.sh/install | bash
```

**2. Ollama + embedding model**
```sh
curl -fsSL https://ollama.com/install.sh | sh
sudo systemctl enable --now ollama
ollama pull nomic-embed-text
```

### Claude Code

```sh
git clone https://github.com/kodylabs/kortex
cd kortex
claude plugin marketplace add .
claude plugin install kortex@kortex
```

Restart Claude Code. The MCP server starts automatically.

### OpenCode

```sh
git clone https://github.com/kodylabs/kortex
cd kortex/plugin && bun install
bun run src/index.ts setup --opencode
```

Registers the MCP server in `~/.config/opencode/opencode.jsonc`, installs the usage skill and the session hook.

## CLI

```sh
bun run plugin/src/index.ts status     # vault stats, DB size, ollama health
bun run plugin/src/index.ts rebuild    # re-index from scratch
bun run plugin/src/index.ts config     # show active config
```

## Configuration

`~/.kortex-mcp/config.json` (created on first run):

```json
{
  "vault_path": "~/kortex-kb",
  "ollama_url": "http://127.0.0.1:11434",
  "embedding_model": "nomic-embed-text",
  "fallback_search": "fts5"
}
```

## Working with the vault

Open `~/kortex-kb` as a vault in Obsidian (**Open folder as vault**). From there it behaves like any Obsidian vault: backlinks, graph view, tags, plugins. Notes Claude writes carry frontmatter (`tags`, `project`), so Obsidian features (Dataview, tag panes, search) work on them out of the box.

Anything you write or edit is picked up by the watcher and re-embedded. Anything Claude writes shows up in your file tree the next time you look. The KB is the contract — neither side owns it alone.

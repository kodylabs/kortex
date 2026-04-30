# kortex

Claude Code plugin that gives Claude a persistent, searchable knowledge base backed by an Obsidian vault.

## How it works

When Claude Code starts, it automatically launches the kortex MCP server (declared in `.mcp.json`). The server exposes tools Claude can call during any session — no manual startup needed.

Notes are stored as plain markdown in `~/kortex-kb/`, a standard Obsidian vault you can open, read, and edit directly in Obsidian. A file watcher keeps the index in sync with any edits made outside Claude.

```
Claude Code
  └─ kortex MCP server (auto-started)
       ├─ save_memory → writes .md to ~/kortex-kb/ + indexes it
       ├─ search      → sqlite-vec (semantic) or FTS5 (fallback)
       └─ status, get_context, recent, list_notes

Obsidian → edits ~/kortex-kb/*.md → file watcher → re-index
```

Embeddings are generated locally via ollama (`nomic-embed-text`, 768-dim vectors stored in SQLite with sqlite-vec). If ollama is offline, keyword search (FTS5) is used as fallback.

**3. Pull the embedding model**
```sh
ollama pull nomic-embed-text
```

### Claude Code (recommended)

**4. Install the plugin**
```sh
git clone https://github.com/kodylabs/kortex
cd kortex
claude plugin marketplace add .
claude plugin install kortex@kortex
```

Restart Claude Code — the MCP server starts automatically and the tools are available.

### OpenCode

**4. Clone and run setup**
```sh
git clone https://github.com/kodylabs/kortex
cd kortex/plugin && bun install
bun run src/index.ts setup --opencode
```

This registers the MCP server in `~/.config/opencode/opencode.jsonc`, installs the usage skill, and installs the session hook that prompts Claude to persist knowledge at session end.

## What the plugin adds

| Component | Claude Code | OpenCode |
|---|---|---|
| MCP tools (`save_memory`, `search`, `get_context`, `recent`, `list_notes`, `status`) | ✓ | ✓ |
| Usage skill | `/kortex:kortex` skill | `~/.config/opencode/skills/kortex/` |
| Session hook (auto-persist prompt) | Stop hook (`hooks/`) | TypeScript plugin (`plugins/`) |

## CLI

```sh
bun run src/index.ts status    # vault stats, DB size, ollama health
bun run src/index.ts rebuild   # re-index the vault from scratch
bun run src/index.ts config    # show active config
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

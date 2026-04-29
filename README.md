# kortex

Claude Code plugin that indexes an Obsidian vault and exposes semantic memory tools (`save_memory`, `search`, `get_context`...) to any MCP-compatible LLM client.

## Installation

**1. Install Bun**
```sh
curl -fsSL https://bun.sh/install | bash
```

**2. Install Ollama and enable auto-start**
```sh
curl -fsSL https://ollama.com/install.sh | sh
sudo systemctl enable --now ollama
```

**3. Pull the embedding model**
```sh
ollama pull nomic-embed-text
```

**4. Install the plugin**
```sh
git clone https://github.com/kodylabs/kortex
claude plugin marketplace add ./kortex
claude plugin install kortex@kortex
```

Restart Claude Code — the kortex plugin is active.

## What the plugin adds

| Component | Description |
|---|---|
| MCP tools | `save_memory`, `search`, `get_context`, `recent`, `list_notes`, `status` |
| Skill `/kortex:kortex` | Guides Claude on when to save / search |
| Stop hook | At session end, Claude decides what to persist |

## CLI

```sh
bun run src/index.ts status    # vault stats, DB size, ollama health
bun run src/index.ts rebuild   # re-index the vault
bun run src/index.ts config    # show active config
```

## How it works

Notes are stored as plain markdown in `~/kortex-kb/` — a standard Obsidian vault you can open directly in Obsidian to read, edit, and organize your knowledge.

When a note is saved (via `save_memory` or edited manually in Obsidian), kortex:
1. Splits the content into overlapping text chunks
2. Sends each chunk to ollama (`nomic-embed-text`) to get a 768-dim embedding vector
3. Stores the chunk text + vector in SQLite via the `sqlite-vec` extension

At search time, your query is embedded the same way and compared against all stored vectors (cosine similarity). If ollama is offline, keyword search (FTS5) is used as fallback.

```
Obsidian ←→ ~/kortex-kb/*.md ←→ kortex (sqlite-vec index) ←→ Claude
```

To open your vault in Obsidian: **Open folder as vault** → select `~/kortex-kb`.

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

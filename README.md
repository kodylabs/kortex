# kortex-mcp

Serveur MCP local qui indexe un vault Obsidian et expose des outils de mémoire sémantique à n'importe quel LLM client compatible MCP (Claude Code, Cursor, OpenCode).

## Prérequis

- [Bun](https://bun.com) ≥ 1.3
- [Ollama](https://ollama.com) (pour les embeddings sémantiques — facultatif, FTS5 utilisé en fallback)

## Installation en une commande

```sh
bun install
bun run src/index.ts setup
```

Le `setup` effectue automatiquement :

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
bun run src/index.ts status    # stats vault, taille DB, santé ollama
bun run src/index.ts rebuild   # ré-indexe tous les fichiers du vault
bun run src/index.ts config    # affiche la configuration active
bun run src/index.ts setup     # setup complet (idempotent, relançable)
```

## Configuration

Fichier : `~/.kortex-mcp/config.json` (créé automatiquement au premier lancement)

```json
{
  "vault_path": "~/kortex-kb",
  "ollama_url": "http://127.0.0.1:11434",
  "embedding_model": "nomic-embed-text",
  "fallback_search": "fts5",
  "chunk_size": 500,
  "chunk_overlap": 50
}
```

## Outils MCP exposés

| Outil | Description |
|---|---|
| `save_memory` | Sauvegarde une note dans le vault + l'indexe |
| `search` | Recherche sémantique (ou FTS5 si ollama offline) |
| `get_context` | Résumé hot.md + notes récentes d'un projet |
| `recent` | N notes les plus récentes |
| `list_notes` | Navigation par projet / tags |

## Architecture

Vault Obsidian (`~/kortex-kb/`) comme source de vérité (markdown lisible),
SQLite + sqlite-vec pour l'index sémantique (reconstruit depuis le vault à tout moment via `rebuild`).
Un file watcher re-indexe automatiquement les fichiers édités dans Obsidian.

# kortex

Plugin Claude Code qui indexe un vault Obsidian et expose des outils de mémoire sémantique (`save_memory`, `search`, `get_context`...) à tout LLM client MCP.

## Prérequis

- [Bun](https://bun.com) ≥ 1.3
- [Ollama](https://ollama.com) (embeddings — FTS5 utilisé en fallback si offline)

## Installation

```sh
bun install
bun run src/index.ts setup
```

Le `setup` :
1. Active le service ollama systemd (démarrage auto au boot)
2. Télécharge le modèle `nomic-embed-text`
3. Crée `~/kortex-kb/` et initialise la base SQLite
4. Installe le plugin dans Claude Code via `claude plugin add`

Relance Claude Code — le plugin kortex est actif.

## Ce que le plugin ajoute

| Composant | Description |
|---|---|
| Outils MCP | `save_memory`, `search`, `get_context`, `recent`, `list_notes` |
| Skill `/kortex:kortex` | Guide Claude sur quand sauvegarder / chercher |
| Stop hook | En fin de session, Claude décide quoi persister |

## CLI

```sh
bun run src/index.ts setup     # setup initial (idempotent)
bun run src/index.ts status    # stats vault, DB, ollama
bun run src/index.ts rebuild   # ré-indexe le vault
bun run src/index.ts config    # config active
```

## Configuration

`~/.kortex-mcp/config.json` (créé au premier lancement) :

```json
{
  "vault_path": "~/kortex-kb",
  "ollama_url": "http://127.0.0.1:11434",
  "embedding_model": "nomic-embed-text",
  "fallback_search": "fts5"
}
```

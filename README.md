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

1. **Ollama** — active le service systemd (`sudo systemctl enable --now ollama`) pour qu'il démarre au boot
2. **Modèle** — télécharge `nomic-embed-text` si absent (`ollama pull nomic-embed-text`)
3. **Vault** — crée `~/kortex-kb/{projects,concepts,perso}` et initialise la base SQLite
4. **MCP** — enregistre le serveur dans `~/.claude/settings.json` (relancer Claude Code pour activer)
5. **Skill** — installe `~/.claude/skills/kortex/SKILL.md` pour l'usage proactif dans Claude Code

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

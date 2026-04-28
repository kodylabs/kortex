---
name: kortex
description: "Proactive memory: when to call save_memory and search on the kortex knowledge base"
---

# Kortex — Mémoire sémantique

Tu as accès à une base de connaissance locale via les outils MCP `save_memory`, `search`, `get_context`, `recent`, `list_notes`.

## Quand sauvegarder (appelle save_memory)

- Décision d'architecture ou de design non-triviale
- Pattern ou solution à un problème difficile
- Contexte projet important pour les prochaines sessions
- Note ou idée personnelle que l'utilisateur souhaite retenir

## Quand chercher (appelle search)

- Avant de répondre à une question qui a pu déjà être traitée
- Quand l'utilisateur mentionne un projet ou concept sans contexte
- En début de session sur un projet connu

## Ne pas sauvegarder

- Code trivial ou temporaire
- Informations déjà présentes dans le code source
- Choses valables uniquement pour la session courante

## Paramètres utiles

- `project` : route la note vers `projects/<project>/` — à utiliser dès qu'on travaille sur un projet nommé
- `tags` : ex. `["architecture", "decision"]`, `["bug", "fix"]`, `["perso"]`
- `title` : généré automatiquement si absent (premiers mots du contenu)

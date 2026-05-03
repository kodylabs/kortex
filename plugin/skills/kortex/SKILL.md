---
name: kortex
description: "Shared knowledge base co-written with the user. Search before answering questions about known projects or recurring topics; maintain the KB by updating existing notes instead of creating new ones. Tools: create_note, read_note, update_note, delete_note, search, get_context, recent, list_notes, status, sync."
---

# Kortex — Shared knowledge base

Kortex is **not** your private memory store. It's a shared Obsidian vault that the user reads and edits in their own tooling. Every note you write will be seen, possibly reorganized, and possibly deleted by a human. Write accordingly.

The contract goes both ways:
- The user writes notes for themselves; you can find them via `search` and use them as context.
- You write notes from sessions; the user curates them in Obsidian.
- Neither side owns the vault alone — treat it as a working document.

## When to search

Search is cheap. Use it whenever the answer might already exist in the vault:

- The user mentions a project, system, or concept by name → `search` it before assuming you don't know.
- A question feels familiar — like it's been asked or solved before.
- Starting work on a known project → `get_context` with the project name to load `hot.md` + recent notes.
- The user says "remember when…", "we decided…", "the way we do X…" — that's an explicit cue.
- **Before creating a note** — always. See "Maintaining the KB" below.

Searching unnecessarily is harmless. Failing to search and re-deriving (or re-saving) something already documented is the failure mode.

## When to write

Write only what survives the session. The bar: *would I (or the user) want this back in three months, in a different conversation?*

**Worth saving:**
- Architecture or design decisions, with the reasoning behind them
- Solutions to non-obvious problems (the kind you'd Google for and not find)
- Project conventions, constraints, gotchas the codebase doesn't reveal
- The user's preferences or working style when stated explicitly
- Cross-cutting context that spans repos or tools

**Not worth saving:**
- What the code already says (someone can read it)
- Routine fixes, typos, lint cleanups
- Step-by-step recaps of what just happened in this session
- Anything tied to ephemeral state (a flaky test today, a temporary branch)
- Restatements of facts already in another note

If in doubt, skip it. A sparse, high-signal vault is more useful than a dense one full of noise.

## Maintaining the KB

The vault is a maintained document, not an append-only log. The workflow is:

**search → read → edit-or-create**

1. **`search`** for the topic before writing anything.
2. If a related note exists, **`read_note`** it to see its current state.
3. Then choose:
   - **`update_note`** when the existing note already covers the topic — extend, refine, or replace its content. This is the default.
   - **`create_note`** only when nothing in the vault covers the topic.
   - For multiple overlapping notes: read them, write a consolidated note via `create_note`, then `delete_note` the originals (composes into a "merge").
4. **`delete_note`** notes that have become wrong, redundant, or noise.

### Worked example

> You're about to save a note on "RTK Token Killer".
>
> 1. `search { query: "RTK token killer" }` → finds `rtk-overview.md`.
> 2. `read_note { filepath: "..." }` → it covers installation but not the new commands you just learned.
> 3. `update_note { filepath: "...", content: "<merged content>" }` → adds the missing section.
>
> Don't `create_note` a second file on the same topic.

### Permission boundary

You can `update_note` and `delete_note` **only** notes that:
- have `author: agent` in their frontmatter (i.e. you wrote them), AND
- have NOT been edited by the human since (`human_edited` is unset or false).

Any human-authored note, or any note the human has refined in Obsidian, is **read-only** to you. The watcher detects external edits automatically and flips `human_edited: true` — you don't have to track it. Attempting to write to a protected note returns a clear error.

This isn't a limitation — it's the contract that makes the shared KB safe. If you think a human-authored note needs changing, surface it in the conversation; don't try to bypass.

### Naming and structure

- `update_note`'s `new_filepath` parameter doubles as a **move/rename** — use it to relocate your own notes when their topic clarifies.
- New folders emerge implicitly from the path you choose at create time. Keep paths conventional (`projects/<name>/notes/<slug>.md`).

## Useful parameters

- `project`: routes the note to `projects/<project>/`. Use whenever there's a clear named project. Cross-cutting notes can omit it.
- `tags`: short, reusable. Aim for tags that already exist in the vault (`list_notes` shows what's there). Examples: `architecture`, `decision`, `bug`, `fix`, `convention`, `gotcha`.
- `title`: explicit titles beat auto-generated ones. Auto-generation falls back to the first words of content.

## How to write a note

Notes are markdown for both human and LLM consumption. Write so a human skimming the file in Obsidian three months from now gets value, AND so a future search finds the right chunk.

- **Title**: state the subject clearly. Not "fix" — `kortex MCP startup failure — missing peer dep`.
- **Lead with the conclusion**: the decision, the answer, the rule. Then the reasoning underneath.
- **Be specific**: name files, commands, versions, dates. A note that says "use the new pattern" rots the day the pattern changes.
- **No session narration**: don't write "the user asked X, I tried Y, then Z worked". Write the final understanding.

## Stop hook behaviour

At session end the Stop hook prompts you to consider saving. **Treat it as a question, not a command.** Most sessions produce nothing worth keeping — that's normal. Save zero notes more often than you save trivial ones.

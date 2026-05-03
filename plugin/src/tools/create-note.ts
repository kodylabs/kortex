import { getEmbedding, isOllamaAvailable } from "../lib/ollama.js";
import { getDb, upsertChunks } from "../lib/db.js";
import { writeNote, generateTitle, updateHotFile } from "../lib/vault.js";
import { chunkText } from "../lib/chunker.js";
import { getRecentNotes } from "../lib/db.js";
import type { Config } from "../lib/config.js";
import * as z from 'zod/v4';

export const createNoteSchema = z.object({
  content: z.string().describe("Content of the note"),
  title: z.string().optional().describe("Title of the note (auto-generated if omitted)"),
  tags: z.array(z.string()).optional().describe('e.g. ["architecture", "decision"]'),
  project: z.string().optional().describe("Project to route the note to (default: 'default')"),
});

export async function createNote(
  args: z.infer<typeof createNoteSchema>,
  config: Config
): Promise<{ note_id: string; filepath: string }> {
  const title = args.title ?? generateTitle(args.content);
  const tags = args.tags ?? [];
  const project = args.project ?? "";

  // Write markdown file to vault first — vault is always the source of truth
  const { filepath, note_id } = writeNote(
    config,
    args.content,
    title,
    tags,
    project
  );

  const db = getDb(config);
  const rawChunks = chunkText(
    args.content,
    config.chunk_size,
    config.chunk_overlap
  );

  const ollamaAvailable = await isOllamaAvailable(config);

  // Embed each chunk; fall back to null so FTS still works if ollama is down
  const chunks = await Promise.all(
    rawChunks.map(async (c) => ({
      content: c.content,
      index: c.index,
      embedding: ollamaAvailable
        ? await getEmbedding(c.content, config)
        : null,
    }))
  );

  upsertChunks(db, filepath, chunks, tags, project);

  // Refresh hot.md with the N most recent notes
  const recent = getRecentNotes(db, config.hot_file_entries);
  const entries = recent.map((n) => `[[${n.title}]] — ${n.updated_at}`);
  updateHotFile(config, entries);

  return { note_id, filepath };
}

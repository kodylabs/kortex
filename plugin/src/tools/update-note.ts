import { writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname } from "path";
import matter from "gray-matter";
import { readNote, deleteNote } from "../lib/vault.js";
import { markToolWrite } from "../lib/watcher.js";
import { NoteAuthor, parseAuthor } from "../types/note.js";
import * as z from 'zod/v4';

export const updateNoteSchema = z.object({
  filepath: z.string().describe("Path to the note"),
  content: z.string().optional().describe("Content of the note"),
  tags: z.array(z.string()).optional().describe("Tags of the note"),
  project: z.string().optional().describe("Project of the note"),
  new_filepath: z.string().optional().describe("New path of the note"),
});

export function updateNote(args: z.infer<typeof updateNoteSchema>): {
  filepath: string;
  moved: boolean;
} {
  const existing = readNote(args.filepath);
  const meta = existing.metadata;
  const author = parseAuthor(meta.author);

  if (author !== NoteAuthor.Agent) {
    throw new Error(
      `Refusing to update ${args.filepath}: not authored by an agent (author=${String(meta.author ?? "unset")}). Only the human can modify human-authored notes.`
    );
  }
  if (meta.human_edited === true) {
    throw new Error(
      `Refusing to update ${args.filepath}: human_edited=true. The human has curated this note; the agent can no longer modify it.`
    );
  }

  const target = args.new_filepath ?? args.filepath;
  const moved = target !== args.filepath;

  const newFrontmatter = {
    ...meta,
    ...(args.tags !== undefined ? { tags: args.tags } : {}),
    ...(args.project !== undefined ? { project: args.project } : {}),
    updated_at: new Date().toISOString(),
    author: NoteAuthor.Agent,
  };
  delete (newFrontmatter as Record<string, unknown>).human_edited;

  const newContent = args.content ?? existing.content;
  const fileContent = matter.stringify(newContent, newFrontmatter);

  const targetDir = dirname(target);
  if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });

  markToolWrite(target);
  writeFileSync(target, fileContent, "utf-8");

  if (moved) deleteNote(args.filepath);

  return { filepath: target, moved };
}

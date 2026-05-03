import { readNote, deleteNote as deleteNoteFromVault } from "../lib/vault.js";
import { NoteAuthor, parseAuthor } from "../types/note.js";
import * as z from 'zod/v4';
export const deleteNoteSchema = z.object({
  filepath: z.string().describe("Path to the note"),
});

export function deleteNote(args: z.infer<typeof deleteNoteSchema>): {
  deleted: true;
  filepath: string;
} {
  const { metadata } = readNote(args.filepath);
  const author = parseAuthor(metadata.author);

  if (author !== NoteAuthor.Agent) {
    throw new Error(
      `Refusing to delete ${args.filepath}: not authored by an agent (author=${String(metadata.author ?? "unset")}). Only the human can delete human-authored notes.`
    );
  }
  if (metadata.human_edited === true) {
    throw new Error(
      `Refusing to delete ${args.filepath}: human_edited=true. The human has curated this note; the agent can no longer delete it.`
    );
  }

  deleteNoteFromVault(args.filepath);
  return { deleted: true, filepath: args.filepath };
}

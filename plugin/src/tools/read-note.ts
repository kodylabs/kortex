import { readNote as readNoteFromVault } from "../lib/vault.js";
import * as z from 'zod/v4';

export const readNoteSchema = z.object({
  filepath: z.string().describe("Path to the note"),
});

export function readNote(args: z.infer<typeof readNoteSchema>): {
  content: string;
  metadata: Record<string, unknown>;
} {
  const { content, metadata } = readNoteFromVault(args.filepath);
  return { content, metadata: metadata as Record<string, unknown> };
}

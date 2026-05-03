import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { getDb, getRecentNotes, listNotes } from "../lib/db.js";
import type { Config } from "../lib/config.js";
import * as z from 'zod/v4';

export const getContextSchema = z.object({
  project: z.string().describe("Project to get context for"),
});

export const recentSchema = z.object({
  n: z.number().optional().describe("Number of notes (default: 10)"),
  project: z.string().optional().describe("Filter by project"),
});

export const listNotesSchema = z.object({
  project: z.string().optional().describe("Filter by project"),
  tags: z.array(z.string()).optional().describe("Filter by tags"),
});

export function getContext(
  args: z.infer<typeof getContextSchema>,
  config: Config
): { hot: string; recent_notes: Array<{ title: string; filepath: string; updated_at: string }> } {
  const hotPath = join(config.vault_path, "hot.md");
  const hot = existsSync(hotPath) ? readFileSync(hotPath, "utf-8") : "";

  const db = getDb(config);
  const recent = getRecentNotes(db, 10, args.project);

  return {
    hot,
    recent_notes: recent.map(({ title, filepath, updated_at }) => ({
      title,
      filepath,
      updated_at,
    })),
  };
}

export function recent(
  args: z.infer<typeof recentSchema>,
  config: Config
): Array<{ title: string; filepath: string; tags: string[]; updated_at: string }> {
  const db = getDb(config);
  return getRecentNotes(db, args.n ?? 10, args.project);
}

export function listNotesTool(
  args: z.infer<typeof listNotesSchema>,
  config: Config
): Array<{ title: string; filepath: string; tags: string[]; updated_at: string }> {
  const db = getDb(config);
  return listNotes(db, args.project, args.tags);
}

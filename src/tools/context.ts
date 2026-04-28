import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { getDb, getRecentNotes, listNotes } from "../lib/db.js";
import type { Config } from "../lib/config.js";

interface GetContextArgs {
  project: string;
}

interface RecentArgs {
  n?: number;
  project?: string;
}

interface ListNotesArgs {
  project?: string;
  tags?: string[];
}

export function getContext(
  args: GetContextArgs,
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
  args: RecentArgs,
  config: Config
): Array<{ title: string; filepath: string; tags: string[]; updated_at: string }> {
  const db = getDb(config);
  return getRecentNotes(db, args.n ?? 10, args.project);
}

export function listNotesTool(
  args: ListNotesArgs,
  config: Config
): Array<{ title: string; filepath: string; tags: string[]; updated_at: string }> {
  const db = getDb(config);
  return listNotes(db, args.project, args.tags);
}

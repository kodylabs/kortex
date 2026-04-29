import { statSync, existsSync } from "fs";
import { join } from "path";
import { getDb, getRecentNotes } from "../lib/db.js";
import { isOllamaAvailable } from "../lib/ollama.js";
import type { Config } from "../lib/config.js";

interface StatusResult {
  vault_path: string;
  files: number;
  chunks: number;
  db_size_mb: number | null;
  ollama_available: boolean;
  embedding_model: string;
  recent_notes: Array<{ title: string; updated_at: string }>;
}

export async function getStatus(config: Config): Promise<StatusResult> {
  const db = getDb(config);
  const ollamaOk = await isOllamaAvailable(config);

  const { total } = db
    .prepare("SELECT COUNT(*) as total FROM chunks")
    .get() as { total: number };

  const { files } = db
    .prepare("SELECT COUNT(DISTINCT filepath) as files FROM chunks")
    .get() as { files: number };

  const dbPath = join(config.vault_path, ".knowledge", "db.sqlite");
  const db_size_mb = existsSync(dbPath)
    ? Math.round((statSync(dbPath).size / 1024 / 1024) * 100) / 100
    : null;

  const recent = getRecentNotes(db, 5);

  return {
    vault_path: config.vault_path,
    files,
    chunks: total,
    db_size_mb,
    ollama_available: ollamaOk,
    embedding_model: config.embedding_model,
    recent_notes: recent.map(({ title, updated_at }) => ({ title, updated_at })),
  };
}

import chokidar from "chokidar";
import { join } from "path";
import { createHash } from "crypto";
import matter from "gray-matter";
import { readFileSync } from "fs";
import { glob } from "glob";
import { getDb, upsertChunks, getFileHash, setFileHash, deleteFileRecord, getAllIndexedFilepaths } from "./db.js";
import { chunkText } from "./chunker.js";
import { getEmbedding, isOllamaAvailable } from "./ollama.js";
import type { Config } from "./config.js";

function computeFileHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function startWatcher(config: Config): void {
  const vaultGlob = join(config.vault_path, "**/*.md");

  const watcher = chokidar.watch(vaultGlob, {
    ignored: [
      join(config.vault_path, ".knowledge", "**"),
      join(config.vault_path, "hot.md"),
    ],
    persistent: true,
    ignoreInitial: true,
  });

  watcher.on("change", (filepath) => void reindexFile(filepath, config));
  watcher.on("add", (filepath) => void reindexFile(filepath, config));
  watcher.on("unlink", (filepath) => {
    const db = getDb(config);
    db.prepare("DELETE FROM chunks_vec WHERE rowid IN (SELECT id FROM chunks WHERE filepath = ?)").run(filepath);
    db.prepare("DELETE FROM chunks_fts WHERE rowid IN (SELECT id FROM chunks WHERE filepath = ?)").run(filepath);
    db.prepare("DELETE FROM chunks WHERE filepath = ?").run(filepath);
    deleteFileRecord(db, filepath);
  });
}

async function reindexFile(filepath: string, config: Config): Promise<void> {
  try {
    const raw = readFileSync(filepath, "utf-8");
    const hash = computeFileHash(raw);
    const parsed = matter(raw);
    const tags = (parsed.data.tags as string[] | undefined) ?? [];
    const project = (parsed.data.project as string | undefined) ?? "";

    const rawChunks = chunkText(
      parsed.content,
      config.chunk_size,
      config.chunk_overlap
    );

    const ollamaAvailable = await isOllamaAvailable(config);
    const chunks = await Promise.all(
      rawChunks.map(async (c) => ({
        content: c.content,
        index: c.index,
        embedding: ollamaAvailable
          ? await getEmbedding(c.content, config)
          : null,
      }))
    );

    const db = getDb(config);
    upsertChunks(db, filepath, chunks, tags, project);
    setFileHash(db, filepath, hash);
  } catch {
    // silently skip files that can't be parsed
  }
}

export async function syncVault(config: Config): Promise<void> {
  const db = getDb(config);
  const files = await glob(join(config.vault_path, "**/*.md"), {
    ignore: [
      join(config.vault_path, ".knowledge", "**"),
      join(config.vault_path, "hot.md"),
    ],
  });

  const onDisk = new Set(files);

  for (const filepath of files) {
    try {
      const raw = readFileSync(filepath, "utf-8");
      const hash = computeFileHash(raw);
      if (getFileHash(db, filepath) !== hash) {
        await reindexFile(filepath, config);
      }
    } catch { /* skip unreadable */ }
  }

  for (const filepath of getAllIndexedFilepaths(db)) {
    if (!onDisk.has(filepath)) {
      db.prepare("DELETE FROM chunks_vec WHERE rowid IN (SELECT id FROM chunks WHERE filepath = ?)").run(filepath);
      db.prepare("DELETE FROM chunks_fts WHERE rowid IN (SELECT id FROM chunks WHERE filepath = ?)").run(filepath);
      db.prepare("DELETE FROM chunks WHERE filepath = ?").run(filepath);
      deleteFileRecord(db, filepath);
    }
  }
}

export async function rebuildIndex(config: Config): Promise<void> {
  const db = getDb(config);

  db.run("DELETE FROM chunks_vec");
  db.run("DELETE FROM chunks_fts");
  db.run("DELETE FROM chunks");
  db.run("DELETE FROM files");

  const files = await glob(join(config.vault_path, "**/*.md"), {
    ignore: [
      join(config.vault_path, ".knowledge", "**"),
      join(config.vault_path, "hot.md"),
    ],
  });

  const ollamaAvailable = await isOllamaAvailable(config);
  console.error(`Rebuilding index: ${files.length} files, ollama=${ollamaAvailable}`);

  for (const filepath of files) {
    await reindexFile(filepath, config);
    process.stderr.write(".");
  }

  console.error("\nDone.");
}

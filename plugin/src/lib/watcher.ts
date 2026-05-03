import chokidar from "chokidar";
import { join } from "path";
import { createHash } from "crypto";
import matter from "gray-matter";
import { readFileSync, writeFileSync } from "fs";
import { glob } from "glob";
import { getDb, upsertChunks, getFileHash, setFileHash, deleteFileRecord, getAllIndexedFilepaths } from "./db.js";
import { chunkText } from "./chunker.js";
import { getEmbedding, isOllamaAvailable } from "./ollama.js";
import type { Config } from "./config.js";

function computeFileHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

// Paths an MCP tool is about to write — chokidar events on these are tool-originated,
// so we skip the human_edited flip for them.
const toolWrittenPaths = new Set<string>();
export function markToolWrite(filepath: string): void {
  toolWrittenPaths.add(filepath);
}

function flipHumanEdited(filepath: string): void {
  try {
    const raw = readFileSync(filepath, "utf-8");
    const parsed = matter(raw);
    if (parsed.data.human_edited === true) return;
    parsed.data.human_edited = true;
    // Suppress the chokidar event our own write is about to trigger
    toolWrittenPaths.add(filepath);
    writeFileSync(filepath, matter.stringify(parsed.content, parsed.data), "utf-8");
  } catch {
    // unreadable / racy delete — ignore
  }
}

export function startWatcher(config: Config): void {
  const knowledgeDir = join(config.vault_path, ".knowledge");
  const hotFile = join(config.vault_path, "hot.md");

  // chokidar v4 removed glob string support — watch the vault root and filter via `ignored`.
  // Allow directories through (they need to be traversed); only allow `.md` files at the leaves.
  const watcher = chokidar.watch(config.vault_path, {
    ignored: (path: string, stats?: { isFile(): boolean }) => {
      if (path.startsWith(knowledgeDir)) return true;
      if (path === hotFile) return true;
      if (stats?.isFile() && !path.endsWith(".md")) return true;
      return false;
    },
    persistent: true,
    ignoreInitial: true,
  });

  watcher.on("change", (filepath) => {
    if (toolWrittenPaths.delete(filepath)) {
      void reindexFile(filepath, config);
      return;
    }
    flipHumanEdited(filepath);
    void reindexFile(filepath, config);
  });
  watcher.on("add", (filepath) => {
    toolWrittenPaths.delete(filepath);
    void reindexFile(filepath, config);
  });
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

import chokidar from "chokidar";
import { join } from "path";
import matter from "gray-matter";
import { readFileSync } from "fs";
import { glob } from "glob";
import { getDb, upsertChunks } from "./db.js";
import { chunkText } from "./chunker.js";
import { getEmbedding, isOllamaAvailable } from "./ollama.js";
import type { Config } from "./config.js";

export function startWatcher(config: Config): void {
  const vaultGlob = join(config.vault_path, "**/*.md");

  // ignored: .knowledge/ dir and hot.md (auto-managed, no need to re-embed)
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
    // Remove all chunks for deleted files
    db.prepare("DELETE FROM chunks_vec WHERE rowid IN (SELECT id FROM chunks WHERE filepath = ?)").run(filepath);
    db.prepare("DELETE FROM chunks_fts WHERE rowid IN (SELECT id FROM chunks WHERE filepath = ?)").run(filepath);
    db.prepare("DELETE FROM chunks WHERE filepath = ?").run(filepath);
  });
}

async function reindexFile(filepath: string, config: Config): Promise<void> {
  try {
    const raw = readFileSync(filepath, "utf-8");
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
  } catch {
    // Silently skip files that can't be parsed (e.g. binary files with .md extension)
  }
}

export async function rebuildIndex(config: Config): Promise<void> {
  const db = getDb(config);

  // Clear all existing index data before rebuilding from scratch
  db.run("DELETE FROM chunks_vec");
  db.run("DELETE FROM chunks_fts");
  db.run("DELETE FROM chunks");

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

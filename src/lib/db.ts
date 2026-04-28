import { Database } from "bun:sqlite";
import { getLoadablePath } from "sqlite-vec";
import { mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import type { Config } from "./config.js";

export interface SearchResult {
  content: string;
  filepath: string;
  score: number;
  tags: string[];
}

type Row = Record<string, unknown>;

let _db: Database | null = null;

export function getDb(config: Config): Database {
  if (_db) return _db;

  const dbPath = join(config.vault_path, ".knowledge", "db.sqlite");
  const dbDir = dirname(dbPath);

  if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });

  const db = new Database(dbPath);
  // Load sqlite-vec native extension to enable vec0 virtual table and FLOAT[] types
  db.loadExtension(getLoadablePath());
  // WAL mode: readers don't block writers, critical for file watcher + MCP tool concurrency
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA synchronous = NORMAL");

  db.run(`
    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filepath TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      project TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.run("CREATE INDEX IF NOT EXISTS idx_chunks_filepath ON chunks(filepath)");
  db.run("CREATE INDEX IF NOT EXISTS idx_chunks_project ON chunks(project)");

  // FTS5 table mirrors chunks for keyword fallback when ollama is unavailable
  db.run(`
    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
      content,
      filepath UNINDEXED,
      tags UNINDEXED,
      project UNINDEXED,
      content='chunks',
      content_rowid='id'
    )
  `);

  // vec0 virtual table: FLOAT[768] matches nomic-embed-text output dimension
  db.run(`
    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_vec USING vec0(
      embedding FLOAT[768]
    )
  `);

  _db = db;
  return db;
}

export function upsertChunks(
  db: Database,
  filepath: string,
  chunks: Array<{ content: string; index: number; embedding: number[] | null }>,
  tags: string[],
  project: string
): void {
  const tagsJson = JSON.stringify(tags);

  // Delete in vec/fts first (foreign-key-like cleanup before chunks table delete)
  // sqlite-vec expects Float32Array, not plain JS array
  db.transaction(() => {
    db.run(
      `DELETE FROM chunks_vec WHERE rowid IN (SELECT id FROM chunks WHERE filepath = ?)`,
      [filepath]
    );
    db.run(
      `DELETE FROM chunks_fts WHERE rowid IN (SELECT id FROM chunks WHERE filepath = ?)`,
      [filepath]
    );
    db.run("DELETE FROM chunks WHERE filepath = ?", [filepath]);

    for (const chunk of chunks) {
      const result = db.run(
        `INSERT INTO chunks (filepath, chunk_index, content, tags, project, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
        [filepath, chunk.index, chunk.content, tagsJson, project]
      );
      // bun:sqlite returns lastInsertRowid as number | bigint; coerce for array usage
      const rowid = Number(result.lastInsertRowid);

      db.run(
        "INSERT INTO chunks_fts(rowid, content, filepath, tags, project) VALUES (?, ?, ?, ?, ?)",
        [rowid, chunk.content, filepath, tagsJson, project]
      );

      if (chunk.embedding) {
        db.run("INSERT INTO chunks_vec(rowid, embedding) VALUES (?, ?)", [
          rowid,
          new Float32Array(chunk.embedding),
        ]);
      }
    }
  })();
}

export function semanticSearch(
  db: Database,
  embedding: number[],
  limit: number,
  project?: string
): SearchResult[] {
  const vec = new Float32Array(embedding);

  // sqlite-vec uses "embedding MATCH ?" syntax; distance is L2 by default
  const rows = (
    project
      ? db.query(`
          SELECT c.content, c.filepath, c.tags, v.distance as score
          FROM chunks_vec v
          JOIN chunks c ON c.id = v.rowid
          WHERE v.embedding MATCH ? AND c.project = ?
          ORDER BY v.distance
          LIMIT ?
        `).all(vec, project, limit)
      : db.query(`
          SELECT c.content, c.filepath, c.tags, v.distance as score
          FROM chunks_vec v
          JOIN chunks c ON c.id = v.rowid
          WHERE v.embedding MATCH ?
          ORDER BY v.distance
          LIMIT ?
        `).all(vec, limit)
  ) as Row[];

  return rows.map((r) => ({
    content: r.content as string,
    filepath: r.filepath as string,
    score: r.score as number,
    tags: JSON.parse(r.tags as string) as string[],
  }));
}

export function ftsSearch(
  db: Database,
  query: string,
  limit: number,
  project?: string
): SearchResult[] {
  const rows = (
    project
      ? db.query(`
          SELECT c.content, c.filepath, c.tags, bm25(chunks_fts) as score
          FROM chunks_fts
          JOIN chunks c ON c.id = chunks_fts.rowid
          WHERE chunks_fts MATCH ? AND c.project = ?
          ORDER BY score
          LIMIT ?
        `).all(query, project, limit)
      : db.query(`
          SELECT c.content, c.filepath, c.tags, bm25(chunks_fts) as score
          FROM chunks_fts
          JOIN chunks c ON c.id = chunks_fts.rowid
          WHERE chunks_fts MATCH ?
          ORDER BY score
          LIMIT ?
        `).all(query, limit)
  ) as Row[];

  return rows.map((r) => ({
    content: r.content as string,
    filepath: r.filepath as string,
    score: r.score as number,
    tags: JSON.parse(r.tags as string) as string[],
  }));
}

export function getRecentNotes(
  db: Database,
  n: number,
  project?: string
): Array<{ title: string; filepath: string; tags: string[]; updated_at: string }> {
  const rows = (
    project
      ? db.query(`
          SELECT filepath, tags, MAX(updated_at) as updated_at
          FROM chunks
          WHERE project = ?
          GROUP BY filepath
          ORDER BY updated_at DESC
          LIMIT ?
        `).all(project, n)
      : db.query(`
          SELECT filepath, tags, MAX(updated_at) as updated_at
          FROM chunks
          GROUP BY filepath
          ORDER BY updated_at DESC
          LIMIT ?
        `).all(n)
  ) as Row[];

  return rows.map((r) => ({
    title: filepathToTitle(r.filepath as string),
    filepath: r.filepath as string,
    tags: JSON.parse(r.tags as string) as string[],
    updated_at: r.updated_at as string,
  }));
}

export function listNotes(
  db: Database,
  project?: string,
  filterTags?: string[]
): Array<{ title: string; filepath: string; tags: string[]; updated_at: string }> {
  const rows = db.query(`
    SELECT filepath, tags, MAX(updated_at) as updated_at
    FROM chunks
    GROUP BY filepath
    ORDER BY updated_at DESC
  `).all() as Row[];

  return rows
    .map((r) => ({
      title: filepathToTitle(r.filepath as string),
      filepath: r.filepath as string,
      tags: JSON.parse(r.tags as string) as string[],
      updated_at: r.updated_at as string,
    }))
    .filter((note) => {
      if (project && !note.filepath.includes(`/projects/${project}/`))
        return false;
      if (filterTags && filterTags.length > 0) {
        return filterTags.some((t) => note.tags.includes(t));
      }
      return true;
    });
}

function filepathToTitle(filepath: string): string {
  const parts = filepath.split("/");
  const filename = parts[parts.length - 1] ?? filepath;
  return filename.replace(/\.md$/, "").replace(/-/g, " ");
}

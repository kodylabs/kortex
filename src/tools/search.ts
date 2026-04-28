import { getEmbedding, isOllamaAvailable } from "../lib/ollama.js";
import { getDb, semanticSearch, ftsSearch } from "../lib/db.js";
import type { Config } from "../lib/config.js";
import type { SearchResult } from "../lib/db.js";

interface SearchArgs {
  query: string;
  project?: string;
  limit?: number;
}

export async function search(
  args: SearchArgs,
  config: Config
): Promise<{ chunks: SearchResult[]; mode: "semantic" | "fts5" }> {
  const db = getDb(config);
  const limit = args.limit ?? config.search_limit_default;

  const ollamaAvailable = await isOllamaAvailable(config);

  if (ollamaAvailable) {
    const embedding = await getEmbedding(args.query, config);
    if (embedding) {
      const chunks = semanticSearch(db, embedding, limit, args.project);
      return { chunks, mode: "semantic" };
    }
  }

  // Fallback to FTS5 keyword search when ollama is unreachable or embedding failed
  const chunks = ftsSearch(db, args.query, limit, args.project);
  return { chunks, mode: "fts5" };
}

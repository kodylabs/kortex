import { getEmbedding, isOllamaAvailable } from "../lib/ollama.js";
import { getDb, semanticSearch, ftsSearch } from "../lib/db.js";
import type { Config } from "../lib/config.js";
import type { SearchResult } from "../lib/db.js";
import * as z from 'zod/v4';

export const searchSchema = z.object({
  query: z.string().describe("Search query"),
  project: z.string().optional().describe("Filter by project"),
  limit: z.number().optional().describe("Max results (default: 5)"),
});

export async function search(
  args: z.infer<typeof searchSchema>,
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

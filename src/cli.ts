import { program } from "commander";
import { loadConfig } from "./lib/config.js";
import { rebuildIndex } from "./lib/watcher.js";
import { getDb, getRecentNotes } from "./lib/db.js";
import { isOllamaAvailable } from "./lib/ollama.js";
import { statSync, existsSync } from "fs";
import { join } from "path";

export function runCli(): void {
  program
    .name("kortex-mcp")
    .description("Kortex MCP — local semantic knowledge base")
    .version("0.1.0");

  program
    .command("rebuild")
    .description("Rebuild the embedding index from vault files")
    .action(async () => {
      const config = loadConfig();
      await rebuildIndex(config);
    });

  program
    .command("status")
    .description("Show vault stats, DB size, and ollama health")
    .action(async () => {
      const config = loadConfig();
      const db = getDb(config);
      const ollamaOk = await isOllamaAvailable(config);

      const { total } = db
        .prepare("SELECT COUNT(*) as total FROM chunks")
        .get() as { total: number };

      const { files } = db
        .prepare(
          "SELECT COUNT(DISTINCT filepath) as files FROM chunks"
        )
        .get() as { files: number };

      const dbPath = join(config.vault_path, ".knowledge", "db.sqlite");
      const dbSize = existsSync(dbPath)
        ? `${(statSync(dbPath).size / 1024 / 1024).toFixed(2)} MB`
        : "not found";

      const recent = getRecentNotes(db, 3);

      console.log(`Vault:   ${config.vault_path}`);
      console.log(`Notes:   ${files} files, ${total} chunks`);
      console.log(`DB:      ${dbSize}`);
      console.log(`Ollama:  ${ollamaOk ? "✓ available" : "✗ offline (FTS5 fallback active)"}`);
      console.log(`Model:   ${config.embedding_model}`);
      if (recent.length > 0) {
        console.log("\nRecent:");
        for (const n of recent) {
          console.log(`  ${n.updated_at}  ${n.title}`);
        }
      }
    });

  program
    .command("config")
    .description("Show current configuration")
    .action(() => {
      const config = loadConfig();
      console.log(JSON.stringify(config, null, 2));
    });

  program.parse(process.argv);
}

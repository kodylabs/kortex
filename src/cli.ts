import { program } from "commander";
import { loadConfig } from "./lib/config.js";
import { rebuildIndex } from "./lib/watcher.js";
import { getDb, getRecentNotes } from "./lib/db.js";
import { isOllamaAvailable } from "./lib/ollama.js";
import { statSync, existsSync, mkdirSync } from "fs";
import { join, resolve } from "path";

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
        .prepare("SELECT COUNT(DISTINCT filepath) as files FROM chunks")
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

  program
    .command("setup")
    .description("One-command install: ollama service, vault init, Claude Code plugin registration")
    .action(async () => {
      console.log("kortex-mcp setup\n");

      // ── Step 1: Ollama systemd service ─────────────────────────────────────
      console.log("1/4  Ollama service…");
      const ollamaInstalled =
        existsSync("/usr/local/bin/ollama") ||
        Boolean(await Bun.$`which ollama`.quiet().catch(() => null));

      if (!ollamaInstalled) {
        console.log(
          "     ✗ ollama not found — install it from https://ollama.com then re-run setup"
        );
      } else {
        // Enable and start the systemd service; requires sudo on most systems
        const enable = await Bun.$`sudo systemctl enable --now ollama`
          .quiet()
          .catch((e: Error) => e);
        if (enable instanceof Error) {
          console.log("     ⚠ sudo unavailable — run manually:");
          console.log("       sudo systemctl enable --now ollama");
        } else {
          console.log("     ✓ ollama service enabled and started (auto-start on boot)");
        }

        // Confirm the API is reachable after (re)starting
        await new Promise((r) => setTimeout(r, 1500));
        const alive = await fetch("http://127.0.0.1:11434/api/tags", {
          signal: AbortSignal.timeout(4_000),
        })
          .then((r) => r.ok)
          .catch(() => false);
        console.log(
          `     ${alive ? "✓ ollama responding on :11434" : "⚠ ollama not responding yet (may still be starting)"}`
        );
      }

      // ── Step 2: Embedding model ────────────────────────────────────────────
      console.log("\n2/4  Modèle nomic-embed-text…");
      const config = loadConfig();
      const listResult = await Bun.$`ollama list`.quiet().catch(() => null);
      const modelPresent =
        listResult?.stdout.toString().includes("nomic-embed-text") ?? false;

      if (modelPresent) {
        console.log("     ✓ already present");
      } else {
        console.log("     → ollama pull nomic-embed-text (may take a few minutes)…");
        const pull = await Bun.$`ollama pull nomic-embed-text`.catch((e: Error) => e);
        if (pull instanceof Error) {
          console.log(
            "     ⚠ pull failed — run manually: ollama pull nomic-embed-text"
          );
        } else {
          console.log("     ✓ model downloaded");
        }
      }

      // ── Step 3: Vault & DB ─────────────────────────────────────────────────
      console.log("\n3/4  Vault & base de données…");
      for (const sub of ["projects", "concepts", "perso"]) {
        mkdirSync(join(config.vault_path, sub), { recursive: true });
      }
      getDb(config); // initialises schema
      console.log(`     ✓ vault: ${config.vault_path}`);
      console.log(`     ✓ DB initialized`);

      // ── Step 4: Plugin install via claude CLI ──────────────────────────────
      console.log("\n4/4  Claude Code plugin…");
      const pluginPath = resolve(import.meta.dir, "..", "plugin");

      const installResult = await Bun.$`claude plugin add ${pluginPath}`
        .quiet()
        .catch((e: Error) => e);
      if (installResult instanceof Error) {
        console.log("     ⚠ claude CLI not found — install manually:");
        console.log(`       claude plugin add ${pluginPath}`);
      } else {
        console.log("     ✓ kortex plugin installed (restart Claude Code to activate)");
      }

      console.log("\n─────────────────────────────────");
      console.log("Setup complete!\n");
      console.log(`  Vault    ${config.vault_path}`);
      console.log(`  Model    ${config.embedding_model}`);
      console.log(`  Config   ~/.kortex-mcp/config.json`);
      console.log(`  Plugin   ${pluginPath}`);
      console.log("\nNext steps:");
      console.log("  1. Restart Claude Code (kortex plugin active)");
      console.log("  2. /kortex:kortex — usage skill");
      console.log("  3. bun run src/index.ts status");

    });

  program.parse(process.argv);
}

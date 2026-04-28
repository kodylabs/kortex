import { program } from "commander";
import { loadConfig } from "./lib/config.js";
import { rebuildIndex } from "./lib/watcher.js";
import { getDb, getRecentNotes } from "./lib/db.js";
import { isOllamaAvailable } from "./lib/ollama.js";
import { statSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname, resolve } from "path";
import { homedir } from "os";
import { fileURLToPath } from "url";

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

  program
    .command("setup")
    .description("One-command install: ollama service, vault, MCP registration, Claude Code skill")
    .action(async () => {
      console.log("kortex-mcp setup\n");

      // ── Step 1: Ollama systemd service ─────────────────────────────────────
      console.log("1/5  Ollama service…");
      const ollamaInstalled = existsSync("/usr/local/bin/ollama") || Boolean(
        await Bun.$`which ollama`.quiet().catch(() => null)
      );

      if (!ollamaInstalled) {
        console.log("     ✗ ollama non trouvé — installe-le depuis https://ollama.com puis relance setup");
      } else {
        // Enable and start the systemd service; requires sudo on most systems
        const enable = await Bun.$`sudo systemctl enable --now ollama`.quiet().catch((e: Error) => e);
        if (enable instanceof Error) {
          console.log("     ⚠ sudo non disponible — lance manuellement :");
          console.log("       sudo systemctl enable --now ollama");
        } else {
          console.log("     ✓ service ollama activé et démarré (boot automatique)");
        }

        // Confirm the API is reachable after (re)starting
        await new Promise((r) => setTimeout(r, 1500));
        const alive = await fetch("http://127.0.0.1:11434/api/tags", {
          signal: AbortSignal.timeout(4_000),
        }).then((r) => r.ok).catch(() => false);
        console.log(`     ${alive ? "✓ ollama répond sur :11434" : "⚠ ollama ne répond pas encore (démarre peut-être)"}`);
      }

      // ── Step 2: Embedding model ────────────────────────────────────────────
      console.log("\n2/5  Modèle nomic-embed-text…");
      const config = loadConfig();
      const listResult = await Bun.$`ollama list`.quiet().catch(() => null);
      const modelPresent = listResult?.stdout.toString().includes("nomic-embed-text") ?? false;

      if (modelPresent) {
        console.log("     ✓ déjà présent");
      } else {
        console.log("     → ollama pull nomic-embed-text (peut prendre quelques minutes)…");
        const pull = await Bun.$`ollama pull nomic-embed-text`.catch((e: Error) => e);
        if (pull instanceof Error) {
          console.log("     ⚠ échec du pull — lance manuellement : ollama pull nomic-embed-text");
        } else {
          console.log("     ✓ modèle téléchargé");
        }
      }

      // ── Step 3: Vault & DB ─────────────────────────────────────────────────
      console.log("\n3/5  Vault & base de données…");
      for (const sub of ["projects", "concepts", "perso"]) {
        mkdirSync(join(config.vault_path, sub), { recursive: true });
      }
      getDb(config); // initialises schema
      console.log(`     ✓ vault : ${config.vault_path}`);
      console.log(`     ✓ DB initialisée`);

      // ── Step 4: MCP registration in ~/.claude/settings.json ───────────────
      console.log("\n4/5  Enregistrement MCP dans ~/.claude/settings.json…");
      const settingsPath = join(homedir(), ".claude", "settings.json");
      // Absolute path to this project's entry point
      const entryPoint = resolve(
        dirname(fileURLToPath(import.meta.url)),
        "index.ts"
      );
      const mcpEntry = { command: "bun", args: ["run", entryPoint] };

      let settings: Record<string, unknown> = {};
      if (existsSync(settingsPath)) {
        settings = JSON.parse(readFileSync(settingsPath, "utf-8")) as Record<string, unknown>;
      }

      const mcpServers = (settings.mcpServers ?? {}) as Record<string, unknown>;
      const alreadyRegistered = JSON.stringify(mcpServers.kortex) === JSON.stringify(mcpEntry);

      mcpServers.kortex = mcpEntry;
      settings.mcpServers = mcpServers;
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");
      console.log(`     ${alreadyRegistered ? "✓ déjà enregistré" : "✓ kortex ajouté"} → relance Claude Code pour activer`);

      // ── Step 5: Claude Code skill ──────────────────────────────────────────
      console.log("\n5/5  Skill Claude Code…");
      const skillDir = join(homedir(), ".claude", "skills", "kortex");
      const skillDest = join(skillDir, "SKILL.md");
      const skillSrc = join(dirname(fileURLToPath(import.meta.url)), "templates", "kortex-skill.md");

      mkdirSync(skillDir, { recursive: true });
      writeFileSync(skillDest, readFileSync(skillSrc, "utf-8"), "utf-8");
      console.log(`     ✓ skill installé → ~/.claude/skills/kortex/SKILL.md`);

      // ── Summary ────────────────────────────────────────────────────────────
      console.log("\n─────────────────────────────────");
      console.log("Setup terminé !\n");
      console.log(`  Vault    ${config.vault_path}`);
      console.log(`  Modèle   ${config.embedding_model}`);
      console.log(`  Config   ~/.kortex-mcp/config.json`);
      console.log("\nProchaines étapes :");
      console.log("  1. Relance Claude Code (le MCP kortex sera disponible)");
      console.log("  2. Lance /kortex dans une conversation pour voir le skill");
      console.log("  3. kortex-mcp status  — pour vérifier l'état du système");
    });

  program.parse(process.argv);
}

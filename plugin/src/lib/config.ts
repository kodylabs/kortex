import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join, resolve } from "path";

export interface Config {
  vault_path: string;
  ollama_url: string;
  embedding_model: string;
  fallback_search: "fts5" | "semantic";
  chunk_size: number;
  chunk_overlap: number;
  hot_file_entries: number;
  search_limit_default: number;
}

const DEFAULTS: Config = {
  vault_path: "~/kortex-kb",
  ollama_url: "http://127.0.0.1:11434",
  embedding_model: "nomic-embed-text",
  fallback_search: "fts5",
  chunk_size: 500,
  chunk_overlap: 50,
  hot_file_entries: 5,
  search_limit_default: 5,
};

const CONFIG_DIR = join(homedir(), ".kortex-mcp");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

export function loadConfig(): Config {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }

  if (!existsSync(CONFIG_PATH)) {
    writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULTS, null, 2));
    return { ...DEFAULTS, vault_path: expandPath(DEFAULTS.vault_path) };
  }

  const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as Partial<Config>;
  const merged = { ...DEFAULTS, ...raw };
  return { ...merged, vault_path: expandPath(merged.vault_path) };
}

export function expandPath(p: string): string {
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return resolve(p);
}

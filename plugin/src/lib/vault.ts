import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import matter from "gray-matter";
import type { Config } from "./config.js";

export interface NoteMetadata {
  title: string;
  tags: string[];
  project: string;
  created_at: string;
  updated_at: string;
}

export function writeNote(
  config: Config,
  content: string,
  title: string,
  tags: string[],
  project: string
): { filepath: string; note_id: string } {
  const slug = titleToSlug(title);
  const dir = project
    ? join(config.vault_path, "projects", project, "notes")
    : join(config.vault_path, "concepts");

  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const filename = `${slug}.md`;
  const filepath = join(dir, filename);
  const now = new Date().toISOString();

  // Check if file exists to preserve created_at
  let created_at = now;
  if (existsSync(filepath)) {
    const existing = matter(readFileSync(filepath, "utf-8"));
    created_at = (existing.data.created_at as string | undefined) ?? now;
  }

  const frontmatter: NoteMetadata = {
    title,
    tags,
    project,
    created_at,
    updated_at: now,
  };

  const fileContent = matter.stringify(content, frontmatter);
  writeFileSync(filepath, fileContent, "utf-8");

  return { filepath, note_id: slug };
}

export function readNote(filepath: string): {
  content: string;
  metadata: Partial<NoteMetadata>;
} {
  const raw = readFileSync(filepath, "utf-8");
  const parsed = matter(raw);
  return {
    content: parsed.content,
    metadata: parsed.data as Partial<NoteMetadata>,
  };
}

export function updateHotFile(config: Config, recentEntries: string[]): void {
  const hotPath = join(config.vault_path, "hot.md");
  const lines = [
    "# Hot — Recent Saves",
    "",
    ...recentEntries.map((e) => `- ${e}`),
    "",
    `_Updated: ${new Date().toISOString()}_`,
  ];
  writeFileSync(hotPath, lines.join("\n"), "utf-8");
}

export function generateTitle(content: string): string {
  // Take the first non-empty line, strip markdown heading markers
  const firstLine = content
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0) ?? "untitled";

  const stripped = firstLine.replace(/^#+\s*/, "").trim();
  // Truncate to 60 chars for a reasonable title
  return stripped.length > 60 ? stripped.slice(0, 60) + "…" : stripped;
}

function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig } from "./lib/config.js";
import { startWatcher, syncVault } from "./lib/watcher.js";
import { saveMemory } from "./tools/save-memory.js";
import { search } from "./tools/search.js";
import { getContext, recent, listNotesTool } from "./tools/context.js";
import { getStatus } from "./tools/status.js";
import { runCli } from "./cli.js";

if (process.argv.length > 2) {
  runCli();
} else {
  await startMcpServer();
}

async function startMcpServer(): Promise<void> {
  const config = loadConfig();

  const server = new McpServer({
    name: "kortex-mcp",
    version: "0.1.0",
    websiteUrl: "https://github.com/kodylabs/kortex",
    description: "Persistent, searchable knowledge base backed by an Obsidian vault.",
  });

  server.registerTool(
    "save_memory",
    {
      title: "Save Memory",
      description: "Persist knowledge to the vault: architecture decisions, patterns, project context, personal notes.",
      inputSchema: {
        content: z.string().describe("Content to save"),
        title: z.string().optional().describe("Optional title — auto-generated if omitted"),
        tags: z.array(z.string()).optional().describe('e.g. ["architecture", "decision"]'),
        project: z.string().optional().describe("Routes note to projects/<project>/ folder"),
      },
    },
    async (args) => {
      const result = await saveMemory(args, config);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "search",
    {
      title: "Search",
      description: "Semantic (or keyword) search over the knowledge vault. Call before answering questions that may have been covered before.",
      inputSchema: {
        query: z.string(),
        project: z.string().optional().describe("Filter by project"),
        limit: z.number().optional().describe("Max results (default: 5)"),
      },
    },
    async (args) => {
      const result = await search(args, config);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "get_context",
    {
      title: "Get Context",
      description: "Get hot.md summary + recent notes for a specific project.",
      inputSchema: {
        project: z.string(),
      },
    },
    (args) => {
      const result = getContext(args, config);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "recent",
    {
      title: "Recent",
      description: "List the N most recently saved notes.",
      inputSchema: {
        n: z.number().optional().describe("Number of notes (default: 10)"),
        project: z.string().optional().describe("Filter by project"),
      },
    },
    (args) => {
      const result = recent(args, config);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "list_notes",
    {
      title: "List Notes",
      description: "Browse all notes, optionally filtered by project or tags.",
      inputSchema: {
        project: z.string().optional(),
        tags: z.array(z.string()).optional(),
      },
    },
    (args) => {
      const result = listNotesTool(args, config);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "status",
    {
      title: "Status",
      description: "Show vault health: file count, chunk count, DB size, ollama availability, and recent notes.",
      inputSchema: {},
    },
    async () => {
      const result = await getStatus(config);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "sync",
    {
      title: "Sync",
      description: "Manually trigger a full vault sync — re-indexes changed files and removes deleted ones.",
      inputSchema: {},
    },
    async () => {
      await syncVault(config);
      const result = await getStatus(config);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);

  void syncVault(config);
  startWatcher(config);
  setInterval(() => void syncVault(config), 30 * 60 * 1000);
}

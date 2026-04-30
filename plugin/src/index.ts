#!/usr/bin/env bun
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { loadConfig } from "./lib/config.js";
import { startWatcher, syncVault } from "./lib/watcher.js";
import { saveMemory } from "./tools/save-memory.js";
import { search } from "./tools/search.js";
import { getContext, recent, listNotesTool } from "./tools/context.js";
import { getStatus } from "./tools/status.js";
import { runCli } from "./cli.js";

// CLI mode: if args are passed, delegate to commander (rebuild, status, config)
if (process.argv.length > 2) {
  runCli();
} else {
  await startMcpServer();
}

async function startMcpServer(): Promise<void> {
  const config = loadConfig();

  const server = new Server(
    { name: "kortex-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: [
      {
        name: "save_memory",
        description:
          "Persist knowledge to the vault: architecture decisions, patterns, project context, personal notes.",
        inputSchema: {
          type: "object",
          properties: {
            content: { type: "string", description: "Content to save" },
            title: {
              type: "string",
              description: "Optional title — auto-generated if omitted",
            },
            tags: {
              type: "array",
              items: { type: "string" },
              description: 'e.g. ["architecture", "decision"]',
            },
            project: {
              type: "string",
              description: "Routes note to projects/<project>/ folder",
            },
          },
          required: ["content"],
        },
      },
      {
        name: "search",
        description:
          "Semantic (or keyword) search over the knowledge vault. Call before answering questions that may have been covered before.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string" },
            project: { type: "string", description: "Filter by project" },
            limit: { type: "number", description: "Max results (default: 5)" },
          },
          required: ["query"],
        },
      },
      {
        name: "get_context",
        description:
          "Get hot.md summary + recent notes for a specific project.",
        inputSchema: {
          type: "object",
          properties: {
            project: { type: "string" },
          },
          required: ["project"],
        },
      },
      {
        name: "recent",
        description: "List the N most recently saved notes.",
        inputSchema: {
          type: "object",
          properties: {
            n: { type: "number", description: "Number of notes (default: 10)" },
            project: { type: "string", description: "Filter by project" },
          },
        },
      },
      {
        name: "list_notes",
        description:
          "Browse all notes, optionally filtered by project or tags.",
        inputSchema: {
          type: "object",
          properties: {
            project: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
          },
        },
      },
      {
        name: "status",
        description:
          "Show vault health: file count, chunk count, DB size, ollama availability, and recent notes.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "sync",
        description:
          "Manually trigger a full vault sync — re-indexes changed files and removes deleted ones.",
        inputSchema: { type: "object", properties: {} },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;

    try {
      switch (name) {
        case "save_memory": {
          const result = await saveMemory(
            args as unknown as Parameters<typeof saveMemory>[0],
            config
          );
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "search": {
          const result = await search(
            args as unknown as Parameters<typeof search>[0],
            config
          );
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "get_context": {
          const result = getContext(
            args as unknown as Parameters<typeof getContext>[0],
            config
          );
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "recent": {
          const result = recent(
            (args ?? {}) as unknown as Parameters<typeof recent>[0],
            config
          );
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "list_notes": {
          const result = listNotesTool(
            (args ?? {}) as unknown as Parameters<typeof listNotesTool>[0],
            config
          );
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "status": {
          const result = await getStatus(config);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        case "sync": {
          await syncVault(config);
          const result = await getStatus(config);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

        default:
          return {
            content: [{ type: "text", text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  void syncVault(config);
  startWatcher(config);
  setInterval(() => void syncVault(config), 30 * 60 * 1000); // sync the vault every 30 minutes
}

#!/usr/bin/env bun
import { McpServer, StdioServerTransport } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { loadConfig } from "./lib/config.js";
import { startWatcher, syncVault } from "./lib/watcher.js";
import { search } from "./tools/search.js";
import { getContext, recent, listNotesTool, getContextSchema, recentSchema } from "./tools/context.js";
import { listNotesSchema } from "./tools/context.js";
import { getStatus } from "./tools/status.js";
import { readNote } from "./tools/read-note.js";
import { updateNote } from "./tools/update-note.js";
import { deleteNote } from "./tools/delete-note.js";
import { runCli } from "./cli.js";
import { createNote } from './tools/create-note.js';
import { createNoteSchema } from './tools/create-note.js';
import { readNoteSchema } from './tools/read-note.js';
import { updateNoteSchema } from './tools/update-note.js';
import { deleteNoteSchema } from './tools/delete-note.js';
import { searchSchema } from './tools/search.js';

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
    "create_note",
    {
      title: "Create Note",
      description: "Create a new note in the vault.",
      inputSchema: createNoteSchema,
    },
    async (args) => {
      const result = await createNote(args, config);
      return {
        content: [{ type: "text", text: `Note created: ${result.filepath}` }],
        structuredOutput: result,
      };
    }
  );

  server.registerTool(
    "read_note",
    {
      title: "Read Note",
      description: "Read a note from the vault.",
      inputSchema: readNoteSchema,
    },
    async (args) => {
      const { content, metadata } = readNote(args);
      return { content: [{ type: "text", text: content }], structuredOutput: { content, metadata } };
    }
  );

  server.registerTool(
    "update_note",
    {
      title: "Update Note",
      description: "Update a note in the vault.",
      inputSchema: updateNoteSchema,
    },
    async (args) => {
      const result = updateNote(args);
      return {
        content: [{ type: "text", text: `Note updated: ${result.filepath}` }],
        structuredOutput: result,
      };
    }
  );

  server.registerTool(
    "delete_note",
    {
      title: "Delete Note",
      description: "Delete a note from the vault.",
      inputSchema: deleteNoteSchema,
    },
    async (args) => {
      const result = deleteNote(args);
      return {
        content: [{ type: "text", text: `Note deleted: ${result.filepath}` }],
        structuredOutput: result,
      };
    }
  );

  server.registerTool(
    "search",
    {
      title: "Search",
      description: "Semantic (or keyword) search over the knowledge vault. Call before answering questions that may have been covered before.",
      inputSchema: searchSchema,
    },
    async (args) => {
      const result = await search(args, config);
      return { content: [{ type: "text", text: `Search results: ${result.chunks.length}` }], structuredOutput: result };
    }
  );

  server.registerTool(
    "get_context",
    {
      title: "Get Context",
      description: "Get hot.md summary + recent notes for a specific project.",
      inputSchema: getContextSchema,
    },
    (args) => {
      const result = getContext(args, config);
      return { content: [{ type: "text", text: result.hot }], structuredOutput: result };
    }
  );

  server.registerTool(
    "recent",
    {
      title: "Recent",
      description: "List the N most recently saved notes.",
      inputSchema: recentSchema,
    },
    (args) => {
      const result = recent(args, config);
      return { content: [{ type: "text", text: result.map((n) => `${n.title} - ${n.updated_at}`).join("\n") }], structuredOutput: result };
    }
  );

  server.registerTool(
    "list_notes",
    {
      title: "List Notes",
      description: "Browse all notes, optionally filtered by project or tags.",
      inputSchema: listNotesSchema,
    },
    (args) => {
      const result = listNotesTool(args, config);
      return { content: [{ type: "text", text: result.map((n) => `${n.title} - ${n.updated_at}`).join("\n") }], structuredOutput: result };
    }
  );

  server.registerTool(
    "status",
    {
      title: "Status",
      description: "Show vault health: file count, chunk count, DB size, ollama availability, and recent notes.",
      inputSchema: z.object({}),
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
      inputSchema: z.object({}),
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

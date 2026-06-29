#!/usr/bin/env bun

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { readdir, readFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { homedir } from "node:os";
import { XMLParser } from "fast-xml-parser";
import TurndownService from "turndown";

const CONFIG_PATH = process.env.EDGEEVER_CONFIG || join(homedir(), ".edgeever", "config.json");
const DEFAULT_URL = "http://127.0.0.1:8787";
const options = parseOptions(process.argv.slice(2));

const usage = `Import Evernote ENEX/NOTES files into EdgeEver through MCP.

Usage:
  EDGEEVER_URL=https://your.edgeever.host EDGEEVER_TOKEN=... \\
    bun scripts/import-evernote-enex-via-mcp.mjs --input ./evernote-export

  bun scripts/import-evernote-enex-via-mcp.mjs --profile prod --input ./evernote-export --dry-run

Options:
  --input <path>      ENEX/NOTES file or a directory containing one export file per notebook.
  --profile <name>   Read URL and token from ~/.edgeever/config.json.
  --dry-run          Parse and print the plan without writing to EdgeEver.
  --yes              Import all notebooks without interactive confirmations.
`;

if (options.help || options.h) {
  console.log(usage);
  process.exit(0);
}

const inputPath = requireValue(options.input, "--input");
const dryRun = Boolean(options["dry-run"]);
const assumeYes = Boolean(options.yes);
const readline = assumeYes ? null : createInterface({ input, output });

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
} finally {
  readline?.close();
}

async function main() {
  const client = dryRun ? null : await createMcpClient(options.profile);
  const notebooks = await readEnexNotebooks(inputPath);

  if (notebooks.length === 0) {
    throw new Error(`No .enex or .notes files found: ${inputPath}`);
  }

  printPlan(notebooks);

  if (dryRun) {
    process.exit(0);
  }

  if (!assumeYes) {
    await confirmOrExit("Start importing the first notebook? Type yes to continue: ");
  }

  let importedNotebookCount = 0;
  let importedMemoCount = 0;

  for (const [index, notebook] of notebooks.entries()) {
    console.log(`\n[${index + 1}/${notebooks.length}] Importing notebook: ${notebook.name}`);
    const before = await mcpCall(client, "list_notebooks", {});
    const targetNotebook = await findOrCreateNotebook(client, before.notebooks || [], notebook.name, index);
    const beforeMemoCount = Number(targetNotebook.memoCount || 0);
    const createdMemoIds = [];

    for (const [memoIndex, note] of notebook.notes.entries()) {
      const result = await mcpCall(client, "create_memo", {
        notebookId: targetNotebook.id,
        title: note.title,
        contentMarkdown: note.markdown,
        tags: note.tags,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
      });

      assertImportedMemoTimestamps(result.memo, note);
      createdMemoIds.push(result.memo.id);
      console.log(`  ${memoIndex + 1}/${notebook.notes.length} ${note.title || "Untitled"}`);
    }

    const after = await mcpCall(client, "list_notebooks", {});
    const verifiedNotebook = (after.notebooks || []).find((item) => item.id === targetNotebook.id);
    const afterMemoCount = Number(verifiedNotebook?.memoCount || 0);
    const delta = afterMemoCount - beforeMemoCount;

    importedNotebookCount += 1;
    importedMemoCount += createdMemoIds.length;

    console.log(`\nNotebook imported: ${notebook.name}`);
    console.log(`  Created memos: ${createdMemoIds.length}`);
    console.log(`  Notebook memo count before: ${beforeMemoCount}`);
    console.log(`  Notebook memo count after:  ${afterMemoCount}`);

    if (delta !== createdMemoIds.length) {
      console.log(`  Warning: memo count delta is ${delta}, expected ${createdMemoIds.length}. Check for concurrent edits or retries.`);
    }

    if (!assumeYes && index < notebooks.length - 1) {
      const answer = await readline.question("Review the result in EdgeEver. Continue with the next notebook? Type yes, or anything else to stop: ");

      if (answer.trim().toLowerCase() !== "yes") {
        console.log("Stopped by user confirmation.");
        break;
      }
    }
  }

  console.log(`\nDone. Imported notebooks: ${importedNotebookCount}; imported memos: ${importedMemoCount}.`);
}

async function readEnexNotebooks(path) {
  const files = await listEnexFiles(path);
  const notebooks = [];

  for (const filePath of files) {
    const notes = await parseEnex(filePath);
    notebooks.push({
      name: notebookNameFromFile(filePath),
      filePath,
      notes,
    });
  }

  return notebooks;
}

async function listEnexFiles(path) {
  if (path.toLowerCase().endsWith(".enex")) {
    return [path];
  }

  if (path.toLowerCase().endsWith(".notes")) {
    return [path];
  }

  const entries = await readdir(path, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && isSupportedExportFile(entry.name))
    .map((entry) => join(path, entry.name))
    .sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
}

async function parseEnex(filePath) {
  const xml = await readFile(filePath, "utf8");
  assertReadableEvernoteXml(xml, filePath);

  const parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    trimValues: false,
    cdataPropName: "__cdata",
    isArray: (_, jpath) => jpath === "en-export.note" || jpath === "en-export.note.tag",
  });
  const parsed = parser.parse(xml);
  const notes = parsed?.["en-export"]?.note || [];

  return notes.map((note, index) => normalizeNote(note, index));
}

function isSupportedExportFile(filePath) {
  const normalized = filePath.toLowerCase();
  return normalized.endsWith(".enex") || normalized.endsWith(".notes");
}

function assertReadableEvernoteXml(xml, filePath) {
  if (/encoding\s*=\s*["']base64:aes["']/i.test(xml)) {
    throw new Error(
      `${filePath} is an encrypted .notes export (encoding="base64:aes"). EdgeEver cannot import encrypted NOTES files because Yinxiang has not published the decryption key. Export an unencrypted NOTES/ENEX file, export HTML, or use a trusted backup/export tool that can produce ENEX/Markdown with original timestamps.`
    );
  }

  if (!/<en-export[\s>]/i.test(xml) || !/<note[\s>]/i.test(xml)) {
    throw new Error(`${filePath} does not look like a readable Evernote XML export.`);
  }
}

function normalizeNote(note, index) {
  const title = getText(note.title)?.trim() || `Untitled ${index + 1}`;
  const content = getText(note.content) || "";
  const createdAt = enexDateToIso(getText(note.created));
  const updatedAt = enexDateToIso(getText(note.updated));
  const tags = Array.isArray(note.tag)
    ? note.tag.map((tag) => getText(tag)?.trim()).filter(Boolean)
    : [];

  if (!createdAt || !updatedAt) {
    throw new Error(`Note "${title}" is missing a valid Evernote created/updated timestamp.`);
  }

  return {
    title: title.slice(0, 160),
    markdown: enexContentToMarkdown(content),
    tags,
    createdAt,
    updatedAt,
  };
}

function assertImportedMemoTimestamps(memo, note) {
  if (memo.createdAt !== note.createdAt || memo.updatedAt !== note.updatedAt) {
    throw new Error(
      `Timestamp mismatch for "${note.title}". Expected createdAt=${note.createdAt}, updatedAt=${note.updatedAt}; got createdAt=${memo.createdAt}, updatedAt=${memo.updatedAt}.`
    );
  }
}

function enexContentToMarkdown(content) {
  const body = content
    .replace(/<\?xml[\s\S]*?\?>/i, "")
    .replace(/<!DOCTYPE[\s\S]*?>/i, "")
    .trim();
  const turndown = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
  });

  turndown.addRule("evernoteTodo", {
    filter: "en-todo",
    replacement: (_, node) => {
      const checked = node.getAttribute("checked") === "true" || node.getAttribute("checked") === "checked";
      return checked ? "[x] " : "[ ] ";
    },
  });

  turndown.addRule("evernoteCrypt", {
    filter: "en-crypt",
    replacement: () => "[Encrypted Evernote content]",
  });

  turndown.addRule("evernoteMedia", {
    filter: "en-media",
    replacement: (_, node) => {
      const type = node.getAttribute("type") || "attachment";
      const hash = node.getAttribute("hash") || "unknown";
      return type.startsWith("image/")
        ? `\n\n![Evernote image ${hash}](evernote-resource:${hash})\n\n`
        : `\n\n[Evernote attachment ${hash}](evernote-resource:${hash})\n\n`;
    },
  });

  return turndown
    .turndown(body || "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function findOrCreateNotebook(client, notebooks, name, index) {
  const existing = notebooks.find((notebook) => notebook.parentId === null && notebook.name === name);

  if (existing) {
    console.log(`Using existing notebook: ${name}`);
    return existing;
  }

  const result = await mcpCall(client, "create_notebook", {
    name: name.slice(0, 80),
    parentId: null,
    sortOrder: 1000 + index,
  });

  console.log(`Created notebook: ${result.notebook.name}`);
  return result.notebook;
}

async function createMcpClient(profileName) {
  const config = await readConfig();
  const profile = profileName ? config.profiles?.[profileName] : undefined;
  const baseUrl = (process.env.EDGEEVER_URL || profile?.url || DEFAULT_URL).replace(/\/+$/, "");
  const token = process.env.EDGEEVER_TOKEN || profile?.token;

  if (!token) {
    throw new Error("EDGEEVER_TOKEN is required, or configure a profile with `bun run cli -- profile set`.");
  }

  return { baseUrl, token, nextId: 1 };
}

async function mcpCall(client, toolName, args) {
  const id = client.nextId++;
  const response = await fetch(`${client.baseUrl}/mcp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${client.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: {
        name: toolName,
        arguments: args,
      },
    }),
  });
  const body = await response.json().catch(() => null);

  if (!response.ok || body?.error) {
    throw new Error(body?.error?.message || `${response.status} ${response.statusText}`);
  }

  return parseMcpToolResult(body.result);
}

function parseMcpToolResult(result) {
  const text = result?.content?.find((item) => item.type === "text")?.text;

  if (!text) {
    return result;
  }

  return JSON.parse(text);
}

async function readConfig() {
  try {
    const value = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

async function confirmOrExit(question) {
  const answer = await readline.question(question);

  if (answer.trim().toLowerCase() !== "yes") {
    console.log("Canceled.");
    process.exit(0);
  }
}

function printPlan(notebooks) {
  const total = notebooks.reduce((sum, notebook) => sum + notebook.notes.length, 0);

  console.log("Evernote import plan:");
  console.log(`  Notebooks: ${notebooks.length}`);
  console.log(`  Notes:     ${total}`);

  for (const notebook of notebooks) {
    console.log(`  - ${notebook.name}: ${notebook.notes.length} notes (${notebook.filePath})`);
  }
}

function getText(value) {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object") {
    return value.__cdata || value["#text"] || "";
  }

  return String(value);
}

function enexDateToIso(value) {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value || "");

  if (!match) {
    return undefined;
  }

  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.000Z`;
}

function notebookNameFromFile(filePath) {
  return basename(filePath, extname(filePath)).trim().slice(0, 80) || "Evernote Import";
}

function parseOptions(args) {
  const parsed = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg.startsWith("--")) {
      continue;
    }

    const key = arg.slice(2);
    const next = args[index + 1];

    if (!next || next.startsWith("--")) {
      parsed[key] = "true";
      continue;
    }

    parsed[key] = next;
    index += 1;
  }

  return parsed;
}

function requireValue(value, name) {
  if (!value) {
    console.error(`${name} is required.\n`);
    console.error(usage);
    process.exit(1);
  }

  return value;
}

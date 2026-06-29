import { XMLParser } from "fast-xml-parser";
import TurndownService from "turndown";

export type EvernoteImportNote = {
  title: string;
  markdown: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type EvernoteImportNotebook = {
  name: string;
  fileName: string;
  notes: EvernoteImportNote[];
};

export const parseEvernoteExportFiles = async (files: File[]): Promise<EvernoteImportNotebook[]> => {
  const notebooks: EvernoteImportNotebook[] = [];

  for (const file of files.filter(isSupportedEvernoteExportFile).sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"))) {
    const xml = await file.text();
    assertReadableEvernoteXml(xml, file.name);
    notebooks.push({
      name: notebookNameFromFile(file.name),
      fileName: file.name,
      notes: parseEvernoteXml(xml, file.name),
    });
  }

  return notebooks;
};

export const isSupportedEvernoteExportFile = (file: File) => {
  const normalized = file.name.toLowerCase();
  return normalized.endsWith(".notes") || normalized.endsWith(".enex");
};

const parseEvernoteXml = (xml: string, fileName: string): EvernoteImportNote[] => {
  const parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    trimValues: false,
    cdataPropName: "__cdata",
    isArray: (_, jpath) => jpath === "en-export.note" || jpath === "en-export.note.tag",
  });
  const parsed = parser.parse(xml);
  const notes = parsed?.["en-export"]?.note || [];

  if (!Array.isArray(notes)) {
    throw new Error(`${fileName} 中没有找到可导入的笔记。`);
  }

  return notes.map((note, index) => normalizeNote(note, index, fileName));
};

const normalizeNote = (note: unknown, index: number, fileName: string): EvernoteImportNote => {
  const current = note && typeof note === "object" ? (note as Record<string, unknown>) : {};
  const title = getText(current.title).trim() || `Untitled ${index + 1}`;
  const content = getText(current.content);
  const createdAt = enexDateToIso(getText(current.created));
  const updatedAt = enexDateToIso(getText(current.updated));
  const tags = Array.isArray(current.tag)
    ? current.tag.map((tag) => getText(tag).trim()).filter(Boolean)
    : [];

  if (!createdAt || !updatedAt) {
    throw new Error(`${fileName} 中的「${title}」缺少合法的创建时间或修改时间。`);
  }

  return {
    title: title.slice(0, 160),
    markdown: evernoteContentToMarkdown(content),
    tags,
    createdAt,
    updatedAt,
  };
};

const evernoteContentToMarkdown = (content: string) => {
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
    filter: (node) => node.nodeName.toLowerCase() === "en-todo",
    replacement: (_, node) => {
      const element = node as HTMLElement;
      const checked = element.getAttribute("checked") === "true" || element.getAttribute("checked") === "checked";
      return checked ? "[x] " : "[ ] ";
    },
  });

  turndown.addRule("evernoteCrypt", {
    filter: (node) => node.nodeName.toLowerCase() === "en-crypt",
    replacement: () => "[Encrypted Evernote content]",
  });

  turndown.addRule("evernoteMedia", {
    filter: (node) => node.nodeName.toLowerCase() === "en-media",
    replacement: (_, node) => {
      const element = node as HTMLElement;
      const type = element.getAttribute("type") || "attachment";
      const hash = element.getAttribute("hash") || "unknown";

      return type.startsWith("image/")
        ? `\n\n![Evernote image ${hash}](evernote-resource:${hash})\n\n`
        : `\n\n[Evernote attachment ${hash}](evernote-resource:${hash})\n\n`;
    },
  });

  return turndown
    .turndown(body || "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const assertReadableEvernoteXml = (xml: string, fileName: string) => {
  if (/encoding\s*=\s*["']base64:aes["']/i.test(xml)) {
    throw new Error(`${fileName} 是加密 .notes 文件，EdgeEver 不能直接读取其中内容。请改用未加密导出、HTML 导出，或先转换为可读的 ENEX/Markdown。`);
  }

  if (!/<en-export[\s>]/i.test(xml) || !/<note[\s>]/i.test(xml)) {
    throw new Error(`${fileName} 看起来不是可读取的印象笔记 XML 导出文件。`);
  }
};

const getText = (value: unknown): string => {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object") {
    const current = value as Record<string, unknown>;
    return typeof current.__cdata === "string"
      ? current.__cdata
      : typeof current["#text"] === "string"
        ? current["#text"]
        : "";
  }

  return String(value);
};

const enexDateToIso = (value: string) => {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value || "");

  if (!match) {
    return undefined;
  }

  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.000Z`;
};

const notebookNameFromFile = (fileName: string) =>
  fileName
    .replace(/\.(notes|enex)$/i, "")
    .trim()
    .slice(0, 80) || "Evernote Import";

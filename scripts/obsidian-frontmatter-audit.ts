/**
 * Standardizes frontmatter across an Obsidian vault: checks every note for
 * title/tags/type/created/updated/status and fills in whatever is missing.
 *
 * Runs against a REAL vault on your own machine — this script is meant to
 * be copied out of this repo (or run from a checkout) and pointed at your
 * vault path. Safe by default: dry-run unless --write is passed, and every
 * file it changes gets backed up first.
 *
 * Usage:
 *   npx tsx scripts/obsidian-frontmatter-audit.ts --vault /pfad/zum/vault [--write]
 */
import { mkdir, readFile, readdir, stat, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { dump, load } from "js-yaml";

const REQUIRED_FIELDS = ["title", "tags", "type", "created", "updated", "status"] as const;

const FOLDER_TO_TYPE: Record<string, string> = {
  "10-notizen": "notiz",
  "20-mocs": "moc",
  "00-inbox": "inbox",
};
const DEFAULT_TYPE = "notiz";
const DEFAULT_STATUS = "draft";

const EXCLUDED_DIR_NAMES = new Set([".obsidian", "vorlagen", "templates", ".git", "node_modules"]);

interface Args {
  vaultPath: string;
  write: boolean;
}

function parseArgs(argv: string[]): Args {
  const vaultIndex = argv.indexOf("--vault");
  const vaultPath = vaultIndex >= 0 ? argv[vaultIndex + 1] : undefined;
  if (!vaultPath) {
    console.error("Usage: obsidian-frontmatter-audit --vault /pfad/zum/vault [--write]");
    process.exit(1);
  }
  return { vaultPath, write: argv.includes("--write") };
}

export async function findMarkdownFiles(root: string, dir: string = root): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIR_NAMES.has(entry.name)) {
        files.push(...(await findMarkdownFiles(root, path.join(dir, entry.name))));
      }
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(path.join(dir, entry.name));
    }
  }
  return files;
}

export function deriveType(vaultRelativePath: string): string {
  const topFolder = vaultRelativePath.split(path.sep)[0];
  return FOLDER_TO_TYPE[topFolder] ?? DEFAULT_TYPE;
}

export function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export interface AuditResult {
  filePath: string;
  addedFields: string[];
  updatedContent?: string;
}

export async function auditFile(root: string, filePath: string): Promise<AuditResult> {
  const content = await readFile(filePath, "utf8");
  const relative = path.relative(root, filePath);
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?/);

  let frontmatter: Record<string, unknown> = {};
  let body = content;
  if (fmMatch) {
    try {
      frontmatter = (load(fmMatch[1]) as Record<string, unknown>) ?? {};
    } catch (error) {
      console.warn(`  ⚠ ${relative}: Frontmatter nicht parsebar, wird übersprungen (${(error as Error).message})`);
      return { filePath, addedFields: [] };
    }
    body = content.slice(fmMatch[0].length);
  }

  const fileStat = await stat(filePath);
  const addedFields: string[] = [];

  if (!("title" in frontmatter) || !frontmatter.title) {
    frontmatter.title = path.basename(filePath, ".md");
    addedFields.push("title");
  }
  if (!("tags" in frontmatter) || frontmatter.tags === undefined) {
    frontmatter.tags = [];
    addedFields.push("tags");
  }
  if (!("type" in frontmatter) || !frontmatter.type) {
    frontmatter.type = deriveType(relative);
    addedFields.push("type");
  }
  if (!("created" in frontmatter) || !frontmatter.created) {
    frontmatter.created = toDateOnly(fileStat.birthtime.getTime() > 0 ? fileStat.birthtime : fileStat.mtime);
    addedFields.push("created");
  }
  if (!("updated" in frontmatter) || !frontmatter.updated) {
    // Falls back to the file's own mtime rather than "today" — this field
    // is being added for the first time, not genuinely edited right now.
    frontmatter.updated = toDateOnly(fileStat.mtime);
    addedFields.push("updated");
  }
  if (!("status" in frontmatter) || !frontmatter.status) {
    frontmatter.status = DEFAULT_STATUS;
    addedFields.push("status");
  }

  if (addedFields.length === 0) {
    return { filePath, addedFields: [] };
  }

  const orderedFrontmatter: Record<string, unknown> = {};
  for (const field of REQUIRED_FIELDS) {
    orderedFrontmatter[field] = frontmatter[field];
  }
  for (const [key, value] of Object.entries(frontmatter)) {
    if (!(key in orderedFrontmatter)) {
      orderedFrontmatter[key] = value;
    }
  }

  const newFrontmatterBlock = `---\n${dump(orderedFrontmatter, { lineWidth: -1 }).trimEnd()}\n---\n`;
  return { filePath, addedFields, updatedContent: `${newFrontmatterBlock}${body}` };
}

async function main(): Promise<void> {
  const { vaultPath, write } = parseArgs(process.argv.slice(2));
  const files = await findMarkdownFiles(vaultPath);
  console.log(`${files.length} Notiz(en) gefunden in ${vaultPath}\n`);

  const results: AuditResult[] = [];
  for (const file of files) {
    results.push(await auditFile(vaultPath, file));
  }

  const changed = results.filter((result) => result.addedFields.length > 0);
  for (const result of changed) {
    const relative = path.relative(vaultPath, result.filePath);
    console.log(`  ${relative}: +${result.addedFields.join(", +")}`);
  }

  console.log(`\n${changed.length} von ${files.length} Notiz(en) brauchen Ergänzungen.`);

  if (!write) {
    console.log("\nDry-Run — keine Datei wurde verändert. Mit --write tatsächlich schreiben.");
    return;
  }

  const backupDir = path.join(vaultPath, `.jarvis-frontmatter-backup-${Date.now()}`);
  await mkdir(backupDir, { recursive: true });

  for (const result of changed) {
    if (!result.updatedContent) continue;
    const relative = path.relative(vaultPath, result.filePath);
    const backupPath = path.join(backupDir, relative);
    await mkdir(path.dirname(backupPath), { recursive: true });
    await copyFile(result.filePath, backupPath);
    await writeFile(result.filePath, result.updatedContent, "utf8");
  }

  console.log(`\n${changed.length} Notiz(en) aktualisiert. Backup der Originale unter: ${backupDir}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Frontmatter-Audit fehlgeschlagen:", error);
    process.exitCode = 1;
  });
}

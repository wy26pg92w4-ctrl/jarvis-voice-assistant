import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { FACTS_FOLDER, INDEX_NOTE_PATH, REMINDERS_FOLDER, formatIndexNote, parseFactNote } from "./noteFormat.js";

/**
 * Raw Markdown file I/O for an Obsidian vault folder, plus maintaining the
 * generated index/MOC note. Knows nothing about Fact/Reminder shapes —
 * ObsidianSync renders note content via `noteFormat` and hands it here.
 * Works with no Obsidian instance running: the vault app just needs to
 * point at (or contain) this folder.
 */
export class VaultWriter {
  constructor(private readonly vaultRoot: string) {}

  async writeNote(relativePath: string, content: string): Promise<void> {
    const absolute = path.join(this.vaultRoot, relativePath);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, content, "utf8");
  }

  async readNote(relativePath: string): Promise<string | undefined> {
    try {
      return await readFile(path.join(this.vaultRoot, relativePath), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return undefined;
      }
      throw error;
    }
  }

  async deleteNote(relativePath: string): Promise<void> {
    try {
      await unlink(path.join(this.vaultRoot, relativePath));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  /** Reads every fact note currently on disk (e.g. edited by hand in Obsidian). */
  async readFactNotes(): Promise<Array<{ key: string; value: string }>> {
    const files = await this.listMarkdownFiles(FACTS_FOLDER);
    const facts: Array<{ key: string; value: string }> = [];
    for (const file of files) {
      const content = await this.readNote(`${FACTS_FOLDER}/${file}`);
      const parsed = content ? parseFactNote(content) : undefined;
      if (parsed) {
        facts.push(parsed);
      }
    }
    return facts;
  }

  /** Rebuilds the MOC/index note by scanning the facts and reminders folders. */
  async regenerateIndex(): Promise<void> {
    const factSlugs = await this.listSlugs(FACTS_FOLDER);
    const reminderSlugs = await this.listSlugs(REMINDERS_FOLDER);
    await this.writeNote(INDEX_NOTE_PATH, formatIndexNote(factSlugs, reminderSlugs));
  }

  private async listSlugs(folder: string): Promise<string[]> {
    const files = await this.listMarkdownFiles(folder);
    return files.map((file) => file.replace(/\.md$/, "")).sort();
  }

  private async listMarkdownFiles(relativeFolder: string): Promise<string[]> {
    try {
      const entries = await readdir(path.join(this.vaultRoot, relativeFolder), { withFileTypes: true });
      return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".md")).map((entry) => entry.name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }
}

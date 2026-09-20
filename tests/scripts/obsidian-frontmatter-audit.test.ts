import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  auditFile,
  deriveType,
  findMarkdownFiles,
  toDateOnly,
} from "../../scripts/obsidian-frontmatter-audit.js";

describe("deriveType", () => {
  it("maps known top-level folders to their type", () => {
    expect(deriveType("10-notizen/foo.md")).toBe("notiz");
    expect(deriveType("20-mocs/foo.md")).toBe("moc");
    expect(deriveType("00-inbox/foo.md")).toBe("inbox");
  });

  it("falls back to 'notiz' for an unmapped folder", () => {
    expect(deriveType("irgendwas/foo.md")).toBe("notiz");
  });
});

describe("toDateOnly", () => {
  it("formats a date as YYYY-MM-DD", () => {
    expect(toDateOnly(new Date("2026-03-05T23:59:00.000Z"))).toBe("2026-03-05");
  });
});

describe("findMarkdownFiles", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "jarvis-audit-find-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("finds markdown files recursively but skips excluded folders", async () => {
    await mkdir(path.join(dir, "10-notizen"), { recursive: true });
    await mkdir(path.join(dir, "vorlagen"), { recursive: true });
    await mkdir(path.join(dir, ".obsidian"), { recursive: true });
    await writeFile(path.join(dir, "10-notizen", "a.md"), "x");
    await writeFile(path.join(dir, "vorlagen", "Notiz.md"), "x");
    await writeFile(path.join(dir, ".obsidian", "config.md"), "x");
    await writeFile(path.join(dir, "not-markdown.txt"), "x");

    const files = await findMarkdownFiles(dir);
    expect(files).toEqual([path.join(dir, "10-notizen", "a.md")]);
  });
});

describe("auditFile", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "jarvis-audit-file-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("reports no changes when all required fields are already present", async () => {
    const filePath = path.join(dir, "10-notizen", "a.md");
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      "---\ntitle: A\ntags: []\ntype: notiz\ncreated: '2026-01-01'\nupdated: '2026-01-01'\nstatus: final\n---\ninhalt\n",
    );

    const result = await auditFile(dir, filePath);
    expect(result.addedFields).toEqual([]);
    expect(result.updatedContent).toBeUndefined();
  });

  it("preserves existing values and only fills in what's missing", async () => {
    const filePath = path.join(dir, "00-inbox", "b.md");
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, "---\nstatus: fertig\n---\ninhalt\n");

    const result = await auditFile(dir, filePath);
    expect(result.addedFields).toEqual(["title", "tags", "type", "created", "updated"]);
    expect(result.updatedContent).toContain("status: fertig");
    expect(result.updatedContent).toContain("type: inbox");
    expect(result.updatedContent).toContain("inhalt");
  });

  it("adds a full frontmatter block to a note that had none", async () => {
    const filePath = path.join(dir, "20-mocs", "c.md");
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, "nur text, keine frontmatter\n");

    const result = await auditFile(dir, filePath);
    expect(result.addedFields).toEqual(["title", "tags", "type", "created", "updated", "status"]);
    expect(result.updatedContent).toMatch(/^---\n/);
    expect(result.updatedContent).toContain("type: moc");
    expect(result.updatedContent).toContain("nur text, keine frontmatter");
  });

  it("skips a file with unparsable frontmatter instead of corrupting it", async () => {
    const filePath = path.join(dir, "10-notizen", "broken.md");
    await mkdir(path.dirname(filePath), { recursive: true });
    const original = "---\ntags: [unclosed\n---\ninhalt\n";
    await writeFile(filePath, original);

    const result = await auditFile(dir, filePath);
    expect(result.addedFields).toEqual([]);
    expect(result.updatedContent).toBeUndefined();
    expect(await readFile(filePath, "utf8")).toBe(original);
  });
});

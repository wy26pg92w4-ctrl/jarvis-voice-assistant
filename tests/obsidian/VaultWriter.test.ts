import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { VaultWriter } from "../../src/obsidian/VaultWriter.js";
import { formatFactNote } from "../../src/obsidian/noteFormat.js";
import type { Fact } from "../../src/memory/types.js";

describe("VaultWriter", () => {
  let dir: string;
  let vault: VaultWriter;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "jarvis-vault-"));
    vault = new VaultWriter(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writes and reads back a note, creating parent folders", async () => {
    await vault.writeNote("Jarvis/Fakten/test.md", "hallo");
    expect(await vault.readNote("Jarvis/Fakten/test.md")).toBe("hallo");
  });

  it("readNote returns undefined for a missing note", async () => {
    expect(await vault.readNote("does/not/exist.md")).toBeUndefined();
  });

  it("deleteNote is a no-op when the note does not exist", async () => {
    await expect(vault.deleteNote("nope.md")).resolves.toBeUndefined();
  });

  it("readFactNotes parses every fact note in the facts folder", async () => {
    const fact: Fact = {
      id: "1",
      key: "lieblingsessen",
      value: "pizza",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    await vault.writeNote("Jarvis/Fakten/lieblingsessen.md", formatFactNote(fact));
    await vault.writeNote("Jarvis/Fakten/not-a-fact.md", "# Irgendwas\n\nkein Frontmatter");

    const facts = await vault.readFactNotes();
    expect(facts).toEqual([{ key: "lieblingsessen", value: "pizza" }]);
  });

  it("readFactNotes returns an empty array when the folder does not exist yet", async () => {
    expect(await vault.readFactNotes()).toEqual([]);
  });

  it("regenerateIndex lists every fact and reminder note found on disk", async () => {
    await vault.writeNote("Jarvis/Fakten/a.md", "x");
    await vault.writeNote("Jarvis/Fakten/b.md", "x");
    await vault.writeNote("Jarvis/Erinnerungen/c.md", "x");

    await vault.regenerateIndex();

    const index = await vault.readNote("Jarvis/Jarvis Gedächtnis.md");
    expect(index).toContain("a|a");
    expect(index).toContain("b|b");
    expect(index).toContain("c|c");
  });
});

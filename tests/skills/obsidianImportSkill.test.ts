import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LongTermMemory } from "../../src/memory/LongTermMemory.js";
import { createImportFromObsidianSkill } from "../../src/skills/builtin/obsidianImportSkill.js";
import type { ObsidianSync } from "../../src/obsidian/ObsidianSync.js";

describe("createImportFromObsidianSkill", () => {
  let dir: string;
  let longTerm: LongTermMemory;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "jarvis-obsidian-import-"));
    longTerm = new LongTermMemory(path.join(dir, "facts.json"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("imports facts found in the vault into long-term memory", async () => {
    const sync = {
      importFactsFromVault: vi.fn().mockResolvedValue([
        { key: "lieblingsessen", value: "pizza" },
        { key: "wohnort", value: "berlin" },
      ]),
    } as unknown as ObsidianSync;
    const skill = createImportFromObsidianSkill(longTerm, sync);

    expect(skill.canHandle("importiere aus obsidian")).toBe(true);
    const reply = await skill.handle("importiere aus obsidian");

    expect(reply).toContain("2 Fakt");
    expect((await longTerm.get("lieblingsessen"))?.value).toBe("pizza");
    expect((await longTerm.get("wohnort"))?.value).toBe("berlin");
  });

  it("reports when nothing was found instead of a misleading success message", async () => {
    const sync = { importFactsFromVault: vi.fn().mockResolvedValue([]) } as unknown as ObsidianSync;
    const skill = createImportFromObsidianSkill(longTerm, sync);

    const reply = await skill.handle("importiere aus obsidian");
    expect(reply).toContain("Keine");
  });
});

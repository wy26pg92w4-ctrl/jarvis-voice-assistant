import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ObsidianSync } from "../../src/obsidian/ObsidianSync.js";
import type { ObsidianRestClient } from "../../src/obsidian/RestClient.js";
import type { VaultWriter } from "../../src/obsidian/VaultWriter.js";
import type { Fact, Reminder } from "../../src/memory/types.js";

function fakeVault(overrides: Partial<VaultWriter> = {}): VaultWriter {
  return {
    writeNote: vi.fn().mockResolvedValue(undefined),
    readNote: vi.fn().mockResolvedValue(undefined),
    deleteNote: vi.fn().mockResolvedValue(undefined),
    regenerateIndex: vi.fn().mockResolvedValue(undefined),
    readFactNotes: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as VaultWriter;
}

function fakeRest(overrides: Partial<ObsidianRestClient> = {}): ObsidianRestClient {
  return {
    putNote: vi.fn().mockResolvedValue(undefined),
    getNote: vi.fn().mockResolvedValue(undefined),
    deleteNote: vi.fn().mockResolvedValue(undefined),
    isReachable: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as unknown as ObsidianRestClient;
}

const fact: Fact = {
  id: "1",
  key: "lieblingsessen",
  value: "pizza",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const reminder: Reminder = {
  id: "1",
  message: "Kaffee holen",
  triggerType: "time",
  dueAt: "2026-01-01T10:00:00.000Z",
  createdAt: "2026-01-01T09:00:00.000Z",
  firedAt: null,
};

describe("ObsidianSync", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("syncFact writes the note, regenerates the index and mirrors to REST when configured", async () => {
    const vault = fakeVault();
    const rest = fakeRest();
    const sync = new ObsidianSync(vault, rest);

    await sync.syncFact(fact);

    expect(vault.writeNote).toHaveBeenCalledWith("Jarvis/Fakten/lieblingsessen.md", expect.stringContaining("pizza"));
    expect(vault.regenerateIndex).toHaveBeenCalledOnce();
    expect(rest.putNote).toHaveBeenCalledWith("Jarvis/Fakten/lieblingsessen.md", expect.stringContaining("pizza"));
  });

  it("works with no REST client configured at all", async () => {
    const vault = fakeVault();
    const sync = new ObsidianSync(vault);
    await expect(sync.syncFact(fact)).resolves.toBeUndefined();
  });

  it("never throws when the vault write fails", async () => {
    const vault = fakeVault({ writeNote: vi.fn().mockRejectedValue(new Error("disk full")) });
    const sync = new ObsidianSync(vault);

    await expect(sync.syncFact(fact)).resolves.toBeUndefined();
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("never throws when the REST push fails (vault write still succeeds)", async () => {
    const vault = fakeVault();
    const rest = fakeRest({ putNote: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")) });
    const sync = new ObsidianSync(vault, rest);

    await expect(sync.syncReminder(reminder)).resolves.toBeUndefined();
    expect(vault.writeNote).toHaveBeenCalled();
  });

  it("removeFact deletes the note and regenerates the index", async () => {
    const vault = fakeVault();
    const sync = new ObsidianSync(vault);

    await sync.removeFact("lieblingsessen");

    expect(vault.deleteNote).toHaveBeenCalledWith("Jarvis/Fakten/lieblingsessen.md");
    expect(vault.regenerateIndex).toHaveBeenCalledOnce();
  });

  it("syncJournalEntry appends to an existing day note instead of overwriting it", async () => {
    const vault = fakeVault({ readNote: vi.fn().mockResolvedValue("---\njarvis_type: journal\n---\n\n# Montag\n") });
    const sync = new ObsidianSync(vault);

    await sync.syncJournalEntry("Zusammenfassung X", new Date("2026-01-05T12:00:00.000Z"));

    const [, content] = (vault.writeNote as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(content).toContain("# Montag");
    expect(content).toContain("Zusammenfassung X");
  });

  it("importFactsFromVault returns [] and logs instead of throwing when reading fails", async () => {
    const vault = fakeVault({ readFactNotes: vi.fn().mockRejectedValue(new Error("boom")) });
    const sync = new ObsidianSync(vault);

    expect(await sync.importFactsFromVault()).toEqual([]);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("importFactsFromVault passes through facts read from the vault", async () => {
    const vault = fakeVault({ readFactNotes: vi.fn().mockResolvedValue([{ key: "a", value: "b" }]) });
    const sync = new ObsidianSync(vault);

    expect(await sync.importFactsFromVault()).toEqual([{ key: "a", value: "b" }]);
  });
});

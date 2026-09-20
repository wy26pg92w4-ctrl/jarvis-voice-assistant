import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SyncedLongTermMemory } from "../../src/obsidian/SyncedLongTermMemory.js";
import { SyncedReminderStore } from "../../src/obsidian/SyncedReminderStore.js";
import { SyncedEpisodicMemory } from "../../src/obsidian/SyncedEpisodicMemory.js";
import type { ObsidianSync } from "../../src/obsidian/ObsidianSync.js";

function fakeSync(): ObsidianSync {
  return {
    syncFact: vi.fn().mockResolvedValue(undefined),
    removeFact: vi.fn().mockResolvedValue(undefined),
    syncReminder: vi.fn().mockResolvedValue(undefined),
    syncJournalEntry: vi.fn().mockResolvedValue(undefined),
    importFactsFromVault: vi.fn().mockResolvedValue([]),
  } as unknown as ObsidianSync;
}

describe("SyncedLongTermMemory", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "jarvis-synced-ltm-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("still stores the fact normally and additionally syncs it", async () => {
    const sync = fakeSync();
    const memory = new SyncedLongTermMemory(path.join(dir, "facts.json"), sync);

    const fact = await memory.remember("Lieblingsessen", "Pizza");

    expect((await memory.get("lieblingsessen"))?.value).toBe("Pizza");
    expect(sync.syncFact).toHaveBeenCalledWith(fact);
  });

  it("forget() syncs removal using the normalized stored key, not the raw input casing", async () => {
    const sync = fakeSync();
    const memory = new SyncedLongTermMemory(path.join(dir, "facts.json"), sync);
    await memory.remember("Lieblingsessen", "Pizza");

    await memory.forget("  LIEBLINGSESSEN  ");

    expect(sync.removeFact).toHaveBeenCalledWith("lieblingsessen");
  });

  it("does not call removeFact when nothing was forgotten", async () => {
    const sync = fakeSync();
    const memory = new SyncedLongTermMemory(path.join(dir, "facts.json"), sync);

    await memory.forget("nichts-da");

    expect(sync.removeFact).not.toHaveBeenCalled();
  });
});

describe("SyncedReminderStore", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "jarvis-synced-reminders-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("syncs a newly created time reminder", async () => {
    const sync = fakeSync();
    const store = new SyncedReminderStore(path.join(dir, "reminders.json"), sync);

    const reminder = await store.createTimeReminder("Kaffee", new Date());

    expect(sync.syncReminder).toHaveBeenCalledWith(reminder);
  });

  it("markFired re-syncs the reminder with its updated firedAt", async () => {
    const sync = fakeSync();
    const store = new SyncedReminderStore(path.join(dir, "reminders.json"), sync);
    const reminder = await store.createTimeReminder("Kaffee", new Date(Date.now() - 1000));
    vi.mocked(sync.syncReminder).mockClear();

    await store.markFired(reminder.id);

    expect(sync.syncReminder).toHaveBeenCalledWith(expect.objectContaining({ id: reminder.id, firedAt: expect.any(String) }));
  });
});

describe("SyncedEpisodicMemory", () => {
  it("syncs a journal entry only when the summary actually changes", async () => {
    const sync = fakeSync();
    const summarizer = vi.fn().mockResolvedValue("Zusammenfassung");
    const memory = new SyncedEpisodicMemory(1, summarizer, sync);

    await memory.add("user", "1");
    await memory.add("assistant", "1a");
    expect(sync.syncJournalEntry).not.toHaveBeenCalled();

    await memory.add("user", "2");
    expect(sync.syncJournalEntry).toHaveBeenCalledWith("Zusammenfassung");
  });
});

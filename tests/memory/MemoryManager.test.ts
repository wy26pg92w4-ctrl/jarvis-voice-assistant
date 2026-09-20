import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EpisodicMemory } from "../../src/memory/EpisodicMemory.js";
import { LongTermMemory } from "../../src/memory/LongTermMemory.js";
import { MemoryManager } from "../../src/memory/MemoryManager.js";
import { ReminderStore } from "../../src/memory/ReminderStore.js";

describe("MemoryManager", () => {
  let dir: string;
  let manager: MemoryManager;
  let longTerm: LongTermMemory;
  let reminders: ReminderStore;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "jarvis-memmgr-"));
    longTerm = new LongTermMemory(path.join(dir, "facts.json"));
    reminders = new ReminderStore(path.join(dir, "reminders.json"));
    manager = new MemoryManager(new EpisodicMemory(10), longTerm, reminders);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("injects only relevant facts into the prepared context", async () => {
    await longTerm.remember("lieblingsessen", "pizza");
    await longTerm.remember("wohnort", "berlin");

    const { messages } = await manager.prepareTurn("was ist mein lieblingsessen?", "system prompt");
    const factMessage = messages.find((m) => m.content.includes("Bekannte Fakten"));

    expect(factMessage?.content).toContain("lieblingsessen: pizza");
    expect(factMessage?.content).not.toContain("wohnort");
  });

  it("surfaces due reminders as a system message and marks them fired after completion", async () => {
    const reminder = await reminders.createTimeReminder("Kaffee holen", new Date(Date.now() - 1000));

    const prepared = await manager.prepareTurn("hallo", "system prompt");
    expect(prepared.dueReminders).toHaveLength(1);
    expect(prepared.messages.some((m) => m.content.includes("Kaffee holen"))).toBe(true);

    await manager.completeTurn("hallo", "klar, hier ist dein Kaffee-Reminder", prepared.dueReminders);

    expect(await reminders.dueReminders()).toHaveLength(0);
    const all = await reminders.list();
    expect(all.find((r) => r.id === reminder.id)?.firedAt).not.toBeNull();
  });

  it("appends the current user turn last and includes prior episodic history", async () => {
    await manager.completeTurn("erste frage", "erste antwort", []);
    const { messages } = await manager.prepareTurn("zweite frage", "system prompt");

    expect(messages.at(-1)).toEqual({ role: "user", content: "zweite frage" });
    expect(messages).toContainEqual({ role: "user", content: "erste frage" });
    expect(messages).toContainEqual({ role: "assistant", content: "erste antwort" });
  });
});

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LongTermMemory } from "../../src/memory/LongTermMemory.js";
import { ReminderStore } from "../../src/memory/ReminderStore.js";
import { scoreRelevance } from "../../src/memory/retrieval.js";
import { createRememberSkill, createRemindSkill } from "../../src/skills/builtin/memorySkills.js";

describe("memory edge cases", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "jarvis-edge-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("round-trips unicode, emoji and quotes in fact values", async () => {
    const memory = new LongTermMemory(path.join(dir, "facts.json"));
    const value = 'Café ☕ "Zürich" — 日本語テスト';
    await memory.remember("test", value);

    const reopened = new LongTermMemory(path.join(dir, "facts.json"));
    expect((await reopened.get("test"))?.value).toBe(value);
  });

  it("handles a very long fact value without truncation", async () => {
    const memory = new LongTermMemory(path.join(dir, "facts.json"));
    const long = "x".repeat(200_000);
    await memory.remember("gross", long);
    expect((await memory.get("gross"))?.value).toHaveLength(200_000);
  });

  it("remember skill rejects an empty statement instead of storing garbage", async () => {
    const memory = new LongTermMemory(path.join(dir, "facts.json"));
    const skill = createRememberSkill(memory);
    const reply = await skill.handle("merke dir:   ");
    expect(reply).toContain("Was genau");
    expect(await memory.list()).toHaveLength(0);
  });

  it("relevance scoring treats an all-whitespace document as no match, not a crash", () => {
    expect(scoreRelevance("irgendwas", "   ")).toBe(0);
  });

  it("remind skill refuses a zero-minute offset only if the regex requires a positive count", async () => {
    const reminders = new ReminderStore(path.join(dir, "reminders.json"));
    const skill = createRemindSkill(reminders);
    // "0" still matches \d+, so this documents current behavior: it schedules
    // an immediately-due reminder rather than rejecting it outright.
    await skill.handle("erinnere mich in 0 minuten an test");
    const due = await reminders.dueReminders(new Date(Date.now() + 1));
    expect(due).toHaveLength(1);
  });

  it("keeps facts with identical values under different keys distinct", async () => {
    const memory = new LongTermMemory(path.join(dir, "facts.json"));
    await memory.remember("a", "gleicher wert");
    await memory.remember("b", "gleicher wert");
    expect(await memory.list()).toHaveLength(2);
  });

  it("forget() on an empty store returns false instead of throwing", async () => {
    const memory = new LongTermMemory(path.join(dir, "facts.json"));
    await expect(memory.forget("irgendwas")).resolves.toBe(false);
  });
});

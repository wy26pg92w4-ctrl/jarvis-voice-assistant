import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LongTermMemory } from "../../src/memory/LongTermMemory.js";
import { ReminderStore } from "../../src/memory/ReminderStore.js";
import {
  createForgetSkill,
  createRecallSkill,
  createRememberSkill,
  createRemindSkill,
} from "../../src/skills/builtin/memorySkills.js";

describe("memory skills", () => {
  let dir: string;
  let longTerm: LongTermMemory;
  let reminders: ReminderStore;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "jarvis-memskills-"));
    longTerm = new LongTermMemory(path.join(dir, "facts.json"));
    reminders = new ReminderStore(path.join(dir, "reminders.json"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("remember skill splits 'X ist Y' into key/value", async () => {
    const skill = createRememberSkill(longTerm);
    expect(skill.canHandle("merke dir mein lieblingsessen ist pizza")).toBe(true);
    const reply = await skill.handle("merke dir mein lieblingsessen ist pizza");
    expect(reply).toContain("mein lieblingsessen");
    expect(reply).toContain("pizza");
    expect((await longTerm.get("mein lieblingsessen"))?.value).toBe("pizza");
  });

  it("remember skill falls back to a timestamped note without 'ist'", async () => {
    const skill = createRememberSkill(longTerm);
    await skill.handle("merke dir ruf mama zurück");
    const facts = await longTerm.list();
    expect(facts).toHaveLength(1);
    expect(facts[0].value).toBe("ruf mama zurück");
  });

  it("forget skill removes a fact and reports misses honestly", async () => {
    await longTerm.remember("stadt", "berlin");
    const skill = createForgetSkill(longTerm);

    const removed = await skill.handle("vergiss stadt");
    expect(removed).toContain("vergessen");
    expect(await skill.handle("vergiss stadt")).toContain("nichts");
  });

  it("recall skill finds facts by topic relevance", async () => {
    await longTerm.remember("lieblingsessen", "pizza");
    const skill = createRecallSkill(longTerm);
    expect(skill.canHandle("was weißt du über lieblingsessen")).toBe(true);
    const reply = await skill.handle("was weißt du über lieblingsessen");
    expect(reply).toContain("pizza");
  });

  it("remind skill schedules a due time based on the parsed offset", async () => {
    const before = Date.now();
    const skill = createRemindSkill(reminders);
    expect(skill.canHandle("erinnere mich in 10 minuten an den kaffee")).toBe(true);
    await skill.handle("erinnere mich in 10 minuten an den kaffee");

    const all = await reminders.list();
    expect(all).toHaveLength(1);
    expect(all[0].message).toBe("den kaffee");
    const dueAt = new Date(all[0].dueAt as string).getTime();
    expect(dueAt).toBeGreaterThanOrEqual(before + 10 * 60_000 - 1000);
    expect(dueAt).toBeLessThanOrEqual(before + 10 * 60_000 + 5000);
  });

  it("remind skill rejects an absurdly large offset instead of crashing on an invalid date", async () => {
    const skill = createRemindSkill(reminders);
    const reply = await skill.handle("erinnere mich in 99999999999999999999 minuten an test");

    expect(reply).not.toContain("Invalid");
    expect(await reminders.list()).toHaveLength(0);
  });
});

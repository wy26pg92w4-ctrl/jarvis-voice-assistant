import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ReminderStore } from "../../src/memory/ReminderStore.js";

describe("ReminderStore", () => {
  let dir: string;
  let filePath: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "jarvis-reminders-"));
    filePath = path.join(dir, "reminders.json");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("reports a time reminder as due once its time has passed", async () => {
    const store = new ReminderStore(filePath);
    const past = new Date(Date.now() - 1000);
    await store.createTimeReminder("Kaffee holen", past);

    const due = await store.dueReminders();
    expect(due).toHaveLength(1);
    expect(due[0].message).toBe("Kaffee holen");
  });

  it("does not report a future reminder as due", async () => {
    const store = new ReminderStore(filePath);
    const future = new Date(Date.now() + 60_000);
    await store.createTimeReminder("Meeting", future);

    expect(await store.dueReminders()).toHaveLength(0);
  });

  it("excludes a reminder once marked fired", async () => {
    const store = new ReminderStore(filePath);
    const past = new Date(Date.now() - 1000);
    const reminder = await store.createTimeReminder("Medikament", past);

    await store.markFired(reminder.id);

    expect(await store.dueReminders()).toHaveLength(0);
    const all = await store.list();
    expect(all[0].firedAt).not.toBeNull();
  });

  it("matches event reminders by event name, ignoring fired ones", async () => {
    const store = new ReminderStore(filePath);
    const reminder = await store.createEventReminder("Server ist wieder online", "server-up");
    await store.createEventReminder("Anderes Event", "other-event");

    const matches = await store.remindersForEvent("server-up");
    expect(matches).toHaveLength(1);

    await store.markFired(reminder.id);
    expect(await store.remindersForEvent("server-up")).toHaveLength(0);
  });
});

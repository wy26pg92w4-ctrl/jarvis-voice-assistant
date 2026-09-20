import { ReminderStore } from "../memory/ReminderStore.js";
import type { Reminder } from "../memory/types.js";
import type { ObsidianSync } from "./ObsidianSync.js";

/**
 * Drop-in ReminderStore that additionally mirrors every change to an
 * Obsidian vault. Kept as a subclass rather than a change to ReminderStore
 * itself so the core memory store stays Obsidian-agnostic and untouched.
 */
export class SyncedReminderStore extends ReminderStore {
  constructor(
    filePath: string,
    private readonly sync: ObsidianSync,
  ) {
    super(filePath);
  }

  override async createTimeReminder(message: string, dueAt: Date): Promise<Reminder> {
    const reminder = await super.createTimeReminder(message, dueAt);
    await this.sync.syncReminder(reminder);
    return reminder;
  }

  override async createEventReminder(message: string, eventName: string): Promise<Reminder> {
    const reminder = await super.createEventReminder(message, eventName);
    await this.sync.syncReminder(reminder);
    return reminder;
  }

  override async markFired(id: string): Promise<void> {
    await super.markFired(id);
    const reminders = await super.list();
    const updated = reminders.find((reminder) => reminder.id === id);
    if (updated) {
      await this.sync.syncReminder(updated);
    }
  }
}

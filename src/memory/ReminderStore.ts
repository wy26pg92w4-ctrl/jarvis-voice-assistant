import { randomUUID } from "node:crypto";
import { JsonFileStore } from "./FileStore.js";
import type { Reminder } from "./types.js";

/**
 * Persistent time- and event-triggered reminders. `dueReminders` is the
 * poll surface the brain checks each turn (and a future scheduler could
 * poll independently) to proactively surface things the user asked to be
 * told about.
 */
export class ReminderStore {
  private readonly store: JsonFileStore<Reminder[]>;

  constructor(filePath: string) {
    this.store = new JsonFileStore<Reminder[]>(filePath, []);
  }

  async createTimeReminder(message: string, dueAt: Date): Promise<Reminder> {
    let created!: Reminder;
    await this.store.update((reminders) => {
      created = {
        id: randomUUID(),
        message,
        triggerType: "time",
        dueAt: dueAt.toISOString(),
        createdAt: new Date().toISOString(),
        firedAt: null,
      };
      reminders.push(created);
      return reminders;
    });
    return created;
  }

  async createEventReminder(message: string, eventName: string): Promise<Reminder> {
    let created!: Reminder;
    await this.store.update((reminders) => {
      created = {
        id: randomUUID(),
        message,
        triggerType: "event",
        eventName,
        createdAt: new Date().toISOString(),
        firedAt: null,
      };
      reminders.push(created);
      return reminders;
    });
    return created;
  }

  async dueReminders(now: Date = new Date()): Promise<Reminder[]> {
    const reminders = await this.store.read();
    return reminders.filter(
      (reminder) =>
        !reminder.firedAt &&
        reminder.triggerType === "time" &&
        reminder.dueAt !== undefined &&
        new Date(reminder.dueAt) <= now,
    );
  }

  async remindersForEvent(eventName: string): Promise<Reminder[]> {
    const reminders = await this.store.read();
    return reminders.filter(
      (reminder) => !reminder.firedAt && reminder.triggerType === "event" && reminder.eventName === eventName,
    );
  }

  async markFired(id: string): Promise<void> {
    await this.store.update((reminders) => {
      const reminder = reminders.find((entry) => entry.id === id);
      if (reminder) {
        reminder.firedAt = new Date().toISOString();
      }
      return reminders;
    });
  }

  async list(): Promise<Reminder[]> {
    return this.store.read();
  }
}

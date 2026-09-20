import type { Fact, Reminder } from "../memory/types.js";
import {
  factNotePath,
  formatFactNote,
  formatJournalEntryAppend,
  formatJournalNoteHeader,
  formatReminderNote,
  journalNotePath,
  reminderNotePath,
} from "./noteFormat.js";
import type { ObsidianRestClient } from "./RestClient.js";
import type { VaultWriter } from "./VaultWriter.js";

/**
 * Orchestrates Jarvis -> Obsidian sync. The vault (plain Markdown files) is
 * always the source of truth and is written synchronously; the REST client,
 * when configured, is a best-effort mirror so a running Obsidian instance
 * reflects changes immediately without needing to reload. Every public
 * method here guarantees it will not throw — a broken or unreachable
 * Obsidian setup must never take down Jarvis's core memory functions.
 */
export class ObsidianSync {
  constructor(
    private readonly vault: VaultWriter,
    private readonly rest?: ObsidianRestClient,
  ) {}

  async syncFact(fact: Fact): Promise<void> {
    await this.guarded("syncFact", async () => {
      const path = factNotePath(fact);
      const content = formatFactNote(fact);
      await this.vault.writeNote(path, content);
      await this.vault.regenerateIndex();
      await this.pushToRest(path, content);
    });
  }

  async removeFact(key: string): Promise<void> {
    await this.guarded("removeFact", async () => {
      const path = factNotePath({ key });
      await this.vault.deleteNote(path);
      await this.vault.regenerateIndex();
      await this.rest?.deleteNote(path).catch(() => undefined);
    });
  }

  async syncReminder(reminder: Reminder): Promise<void> {
    await this.guarded("syncReminder", async () => {
      const path = reminderNotePath(reminder);
      const content = formatReminderNote(reminder);
      await this.vault.writeNote(path, content);
      await this.vault.regenerateIndex();
      await this.pushToRest(path, content);
    });
  }

  async syncJournalEntry(summary: string, at: Date = new Date()): Promise<void> {
    await this.guarded("syncJournalEntry", async () => {
      const path = journalNotePath(at);
      const existing = (await this.vault.readNote(path)) ?? formatJournalNoteHeader(at);
      const updated = `${existing.trimEnd()}\n\n${formatJournalEntryAppend(summary, at)}`;
      await this.vault.writeNote(path, updated);
      await this.pushToRest(path, updated);
    });
  }

  /** Reads fact notes back from the vault (e.g. facts added/edited by hand in Obsidian). */
  async importFactsFromVault(): Promise<Array<{ key: string; value: string }>> {
    try {
      return await this.vault.readFactNotes();
    } catch (error) {
      console.error("[ObsidianSync] importFactsFromVault fehlgeschlagen:", error);
      return [];
    }
  }

  private async pushToRest(path: string, content: string): Promise<void> {
    await this.rest?.putNote(path, content).catch(() => undefined);
  }

  private async guarded(op: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (error) {
      console.error(`[ObsidianSync] ${op} fehlgeschlagen:`, error);
    }
  }
}

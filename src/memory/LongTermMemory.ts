import { randomUUID } from "node:crypto";
import { JsonFileStore } from "./FileStore.js";
import type { Fact } from "./types.js";

/**
 * Persistent facts and preferences about the user ("mein lieblingsessen" ->
 * "pizza"), keyed by a normalized key so re-remembering the same thing
 * updates it in place instead of accumulating duplicates.
 */
export class LongTermMemory {
  private readonly store: JsonFileStore<Fact[]>;

  constructor(filePath: string) {
    this.store = new JsonFileStore<Fact[]>(filePath, []);
  }

  async remember(key: string, value: string): Promise<Fact> {
    const normalizedKey = key.trim().toLowerCase();
    let result!: Fact;
    await this.store.update((facts) => {
      const now = new Date().toISOString();
      const existing = facts.find((fact) => fact.key === normalizedKey);
      if (existing) {
        existing.value = value;
        existing.updatedAt = now;
        result = existing;
        return facts;
      }
      const fact: Fact = { id: randomUUID(), key: normalizedKey, value, createdAt: now, updatedAt: now };
      facts.push(fact);
      result = fact;
      return facts;
    });
    return result;
  }

  async forget(key: string): Promise<boolean> {
    const normalizedKey = key.trim().toLowerCase();
    let removed = false;
    await this.store.update((facts) => {
      const next = facts.filter((fact) => fact.key !== normalizedKey);
      removed = next.length !== facts.length;
      return next;
    });
    return removed;
  }

  async get(key: string): Promise<Fact | undefined> {
    const normalizedKey = key.trim().toLowerCase();
    const facts = await this.store.read();
    return facts.find((fact) => fact.key === normalizedKey);
  }

  async list(): Promise<Fact[]> {
    return this.store.read();
  }
}

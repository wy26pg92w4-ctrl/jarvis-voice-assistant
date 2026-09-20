import { LongTermMemory } from "../memory/LongTermMemory.js";
import type { Fact } from "../memory/types.js";
import type { ObsidianSync } from "./ObsidianSync.js";

/**
 * Drop-in LongTermMemory that additionally mirrors every change to an
 * Obsidian vault. Kept as a subclass rather than a change to LongTermMemory
 * itself so the core memory store stays Obsidian-agnostic and untouched.
 */
export class SyncedLongTermMemory extends LongTermMemory {
  constructor(
    filePath: string,
    private readonly sync: ObsidianSync,
  ) {
    super(filePath);
  }

  override async remember(key: string, value: string): Promise<Fact> {
    const fact = await super.remember(key, value);
    await this.sync.syncFact(fact);
    return fact;
  }

  override async forget(key: string): Promise<boolean> {
    // Capture the stored (normalized) key before removal so the Obsidian
    // note path — derived the same way `remember()` derived it — matches,
    // regardless of how the caller capitalized/spaced the input key.
    const existing = await this.get(key);
    const removed = await super.forget(key);
    if (removed && existing) {
      await this.sync.removeFact(existing.key);
    }
    return removed;
  }
}

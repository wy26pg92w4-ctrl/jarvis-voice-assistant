import { EpisodicMemory } from "../memory/EpisodicMemory.js";
import type { ObsidianSync } from "./ObsidianSync.js";

/**
 * Drop-in EpisodicMemory that appends to an Obsidian daily journal note
 * whenever the rolling conversation summary changes (i.e. whenever old
 * turns get folded/compressed — see EpisodicMemory.add). Kept as a subclass
 * so the core memory class stays Obsidian-agnostic and untouched.
 */
export class SyncedEpisodicMemory extends EpisodicMemory {
  constructor(
    maxTurns: number,
    summarizer: ConstructorParameters<typeof EpisodicMemory>[1],
    private readonly sync: ObsidianSync,
  ) {
    super(maxTurns, summarizer);
  }

  override async add(role: "user" | "assistant", content: string): Promise<void> {
    const before = this.getSummary();
    await super.add(role, content);
    const after = this.getSummary();
    if (after && after !== before) {
      await this.sync.syncJournalEntry(after);
    }
  }
}

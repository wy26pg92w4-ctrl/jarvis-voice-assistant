import type { LongTermMemory } from "../../memory/LongTermMemory.js";
import type { ObsidianSync } from "../../obsidian/ObsidianSync.js";
import type { Skill } from "../Skill.js";

const TRIGGER = /^importiere?(?: alles)? aus obsidian$/i;

/**
 * Re-reads fact notes from the Obsidian vault (e.g. ones added or edited by
 * hand there) and upserts them into long-term memory. One-way: vault -> Jarvis.
 */
export function createImportFromObsidianSkill(longTerm: LongTermMemory, obsidianSync: ObsidianSync): Skill {
  return {
    name: "obsidian-import",
    description: "Liest Fakten-Notizen aus dem Obsidian-Vault neu ein ('importiere aus obsidian').",
    canHandle: (input) => TRIGGER.test(input.trim()),
    handle: async () => {
      const facts = await obsidianSync.importFactsFromVault();
      let imported = 0;
      for (const fact of facts) {
        if (fact.key && fact.value) {
          await longTerm.remember(fact.key, fact.value);
          imported += 1;
        }
      }
      return imported > 0
        ? `${imported} Fakt(en) aus Obsidian übernommen.`
        : "Keine (neuen) Fakten-Notizen im Obsidian-Vault gefunden.";
    },
  };
}

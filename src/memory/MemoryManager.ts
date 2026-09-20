import type { ChatMessage } from "../llm/OmniRouteClient.js";
import type { EpisodicMemory } from "./EpisodicMemory.js";
import type { LongTermMemory } from "./LongTermMemory.js";
import type { ReminderStore } from "./ReminderStore.js";
import { rankByRelevance } from "./retrieval.js";
import type { Reminder } from "./types.js";

const MAX_RELEVANT_FACTS = 5;

export interface PreparedTurn {
  messages: ChatMessage[];
  dueReminders: Reminder[];
}

/**
 * Composes short-term (episodic), long-term (facts) and reminder memory
 * into the context the LLM sees, and records each turn back into episodic
 * memory once a reply exists.
 */
export class MemoryManager {
  constructor(
    private readonly episodic: EpisodicMemory,
    private readonly longTerm: LongTermMemory,
    private readonly reminders: ReminderStore,
  ) {}

  async prepareTurn(userInput: string, systemPrompt: string): Promise<PreparedTurn> {
    const [facts, dueReminders] = await Promise.all([this.longTerm.list(), this.reminders.dueReminders()]);
    const relevantFacts = rankByRelevance(userInput, facts, (fact) => `${fact.key} ${fact.value}`, MAX_RELEVANT_FACTS);

    const messages: ChatMessage[] = [{ role: "system", content: systemPrompt }];
    if (relevantFacts.length > 0) {
      const factLines = relevantFacts.map((fact) => `- ${fact.key}: ${fact.value}`).join("\n");
      messages.push({ role: "system", content: `Bekannte Fakten über den Nutzer:\n${factLines}` });
    }
    if (dueReminders.length > 0) {
      const dueLines = dueReminders.map((reminder) => `- ${reminder.message}`).join("\n");
      messages.push({
        role: "system",
        content: `Fällige Erinnerungen — sprich sie jetzt proaktiv an, bevor du auf die eigentliche Nachricht eingehst:\n${dueLines}`,
      });
    }
    messages.push(...this.episodic.getContext());
    messages.push({ role: "user", content: userInput });

    return { messages, dueReminders };
  }

  async completeTurn(userInput: string, reply: string, dueReminders: Reminder[]): Promise<void> {
    await this.episodic.add("user", userInput);
    await this.episodic.add("assistant", reply);
    await Promise.all(dueReminders.map((reminder) => this.reminders.markFired(reminder.id)));
  }

  get facts(): LongTermMemory {
    return this.longTerm;
  }

  get reminderStore(): ReminderStore {
    return this.reminders;
  }
}

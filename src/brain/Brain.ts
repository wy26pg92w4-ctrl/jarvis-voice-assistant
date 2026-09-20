import type { OmniRouteClient } from "../llm/OmniRouteClient.js";
import type { MemoryManager } from "../memory/MemoryManager.js";
import type { SkillRegistry } from "../skills/SkillRegistry.js";

/**
 * Central orchestrator of the Jarvis brain: routes user input either to a
 * matching skill (deterministic, no LLM round-trip) or, as fallback, to the
 * LLM gateway (OmniRoute) with memory (facts, due reminders, conversation
 * history/summary) assembled as context.
 */
export class Brain {
  constructor(
    private readonly llm: OmniRouteClient,
    private readonly memory: MemoryManager,
    private readonly skills: SkillRegistry,
    private readonly systemPrompt: string,
  ) {}

  async respond(userInput: string): Promise<string> {
    const skill = this.skills.find(userInput);
    if (skill) {
      const reply = await skill.handle(userInput);
      await this.memory.completeTurn(userInput, reply, []);
      return reply;
    }

    const { messages, dueReminders } = await this.memory.prepareTurn(userInput, this.systemPrompt);
    const reply = await this.llm.chat(messages);
    await this.memory.completeTurn(userInput, reply, dueReminders);
    return reply;
  }
}

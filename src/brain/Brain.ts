import type { OmniRouteClient } from "../llm/OmniRouteClient.js";
import type { ConversationMemory } from "../memory/ConversationMemory.js";
import type { SkillRegistry } from "../skills/SkillRegistry.js";

/**
 * Central orchestrator of the Jarvis brain: routes user input either to a
 * matching skill (deterministic, no LLM round-trip) or, as fallback, to the
 * LLM gateway (OmniRoute) with the running conversation as context.
 */
export class Brain {
  constructor(
    private readonly llm: OmniRouteClient,
    private readonly memory: ConversationMemory,
    private readonly skills: SkillRegistry,
    private readonly systemPrompt: string,
  ) {}

  async respond(userInput: string): Promise<string> {
    const skill = this.skills.find(userInput);
    if (skill) {
      const reply = await skill.handle(userInput);
      this.memory.add("user", userInput);
      this.memory.add("assistant", reply);
      return reply;
    }

    this.memory.add("user", userInput);
    const reply = await this.llm.chat([
      { role: "system", content: this.systemPrompt },
      ...this.memory.getHistory(),
    ]);
    this.memory.add("assistant", reply);
    return reply;
  }
}

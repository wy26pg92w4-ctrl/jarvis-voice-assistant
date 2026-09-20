import { describe, expect, it, vi } from "vitest";
import { Brain } from "../src/brain/Brain.js";
import { ConversationMemory } from "../src/memory/ConversationMemory.js";
import { SkillRegistry } from "../src/skills/SkillRegistry.js";
import type { OmniRouteClient } from "../src/llm/OmniRouteClient.js";
import type { Skill } from "../src/skills/Skill.js";

function fakeLlm(reply: string): OmniRouteClient {
  return { chat: vi.fn().mockResolvedValue(reply) } as unknown as OmniRouteClient;
}

describe("Brain", () => {
  it("routes matching input to a skill without calling the LLM", async () => {
    const llm = fakeLlm("should not be used");
    const skills = new SkillRegistry();
    const skill: Skill = {
      name: "echo",
      description: "echoes",
      canHandle: (input) => input === "ping",
      handle: () => "pong",
    };
    skills.register(skill);
    const brain = new Brain(llm, new ConversationMemory(10), skills, "system prompt");

    const reply = await brain.respond("ping");

    expect(reply).toBe("pong");
    expect(llm.chat).not.toHaveBeenCalled();
  });

  it("falls back to the LLM gateway with system prompt and history", async () => {
    const llm = fakeLlm("llm reply");
    const memory = new ConversationMemory(10);
    const skills = new SkillRegistry();
    const brain = new Brain(llm, memory, skills, "system prompt");

    const reply = await brain.respond("hallo");

    expect(reply).toBe("llm reply");
    expect(llm.chat).toHaveBeenCalledWith([
      { role: "system", content: "system prompt" },
      { role: "user", content: "hallo" },
    ]);
    expect(memory.getHistory()).toEqual([
      { role: "user", content: "hallo" },
      { role: "assistant", content: "llm reply" },
    ]);
  });
});

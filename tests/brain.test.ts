import { describe, expect, it, vi } from "vitest";
import { Brain } from "../src/brain/Brain.js";
import { SkillRegistry } from "../src/skills/SkillRegistry.js";
import type { OmniRouteClient } from "../src/llm/OmniRouteClient.js";
import type { MemoryManager } from "../src/memory/MemoryManager.js";
import type { Skill } from "../src/skills/Skill.js";

function fakeLlm(reply: string): OmniRouteClient {
  return { chat: vi.fn().mockResolvedValue(reply) } as unknown as OmniRouteClient;
}

function fakeMemory(prepared: { messages: unknown[]; dueReminders: unknown[] }): MemoryManager {
  return {
    prepareTurn: vi.fn().mockResolvedValue(prepared),
    completeTurn: vi.fn().mockResolvedValue(undefined),
  } as unknown as MemoryManager;
}

describe("Brain", () => {
  it("routes matching input to a skill without calling the LLM or memory context", async () => {
    const llm = fakeLlm("should not be used");
    const memory = fakeMemory({ messages: [], dueReminders: [] });
    const skills = new SkillRegistry();
    const skill: Skill = {
      name: "echo",
      description: "echoes",
      canHandle: (input) => input === "ping",
      handle: () => "pong",
    };
    skills.register(skill);
    const brain = new Brain(llm, memory, skills, "system prompt");

    const reply = await brain.respond("ping");

    expect(reply).toBe("pong");
    expect(llm.chat).not.toHaveBeenCalled();
    expect(memory.prepareTurn).not.toHaveBeenCalled();
    expect(memory.completeTurn).toHaveBeenCalledWith("ping", "pong", []);
  });

  it("falls back to the LLM gateway with memory-prepared context and records the reply", async () => {
    const llm = fakeLlm("llm reply");
    const preparedMessages = [{ role: "system", content: "system prompt" }, { role: "user", content: "hallo" }];
    const dueReminders = [{ id: "r1" }];
    const memory = fakeMemory({ messages: preparedMessages, dueReminders });
    const skills = new SkillRegistry();
    const brain = new Brain(llm, memory, skills, "system prompt");

    const reply = await brain.respond("hallo");

    expect(reply).toBe("llm reply");
    expect(memory.prepareTurn).toHaveBeenCalledWith("hallo", "system prompt");
    expect(llm.chat).toHaveBeenCalledWith(preparedMessages);
    expect(memory.completeTurn).toHaveBeenCalledWith("hallo", "llm reply", dueReminders);
  });
});

import { describe, expect, it, vi } from "vitest";
import { EpisodicMemory } from "../../src/memory/EpisodicMemory.js";

describe("EpisodicMemory", () => {
  it("keeps all turns in context while under the limit", async () => {
    const memory = new EpisodicMemory(2);
    await memory.add("user", "hi");
    await memory.add("assistant", "hello");

    expect(memory.getContext()).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);
  });

  it("folds overflowing turns into a heuristic summary when no summarizer is given", async () => {
    const memory = new EpisodicMemory(1);
    await memory.add("user", "erste nachricht");
    await memory.add("assistant", "erste antwort");
    await memory.add("user", "zweite nachricht");
    await memory.add("assistant", "zweite antwort");

    const context = memory.getContext();
    expect(context[0].role).toBe("system");
    expect(context[0].content).toContain("erste nachricht");
    // only the most recent turn (maxTurns=1 -> 2 messages) stays verbatim
    expect(context.slice(1)).toEqual([
      { role: "user", content: "zweite nachricht" },
      { role: "assistant", content: "zweite antwort" },
    ]);
  });

  it("delegates summarization to the injected summarizer and accumulates it", async () => {
    const summarizer = vi.fn().mockResolvedValueOnce("Zusammenfassung A").mockResolvedValueOnce("Zusammenfassung A+B");
    const memory = new EpisodicMemory(1, summarizer);

    await memory.add("user", "1");
    await memory.add("assistant", "1a");
    await memory.add("user", "2");
    await memory.add("assistant", "2a");
    expect(memory.getSummary()).toBe("Zusammenfassung A");

    await memory.add("user", "3");
    await memory.add("assistant", "3a");
    expect(memory.getSummary()).toBe("Zusammenfassung A+B");
    expect(summarizer).toHaveBeenCalledTimes(2);
  });

  it("does not let a blank summarizer reply wipe out the accumulated summary", async () => {
    const summarizer = vi.fn().mockResolvedValueOnce("Wichtige Zusammenfassung A").mockResolvedValueOnce("   ");
    const memory = new EpisodicMemory(1, summarizer);

    for (let i = 0; i < 6; i++) {
      await memory.add(i % 2 === 0 ? "user" : "assistant", `msg ${i}`);
    }

    expect(memory.getSummary()).toContain("Wichtige Zusammenfassung A");
  });

  it("falls back to the heuristic summary when the summarizer throws", async () => {
    const summarizer = vi.fn().mockRejectedValue(new Error("gateway down"));
    const memory = new EpisodicMemory(1, summarizer);

    await memory.add("user", "erste nachricht");
    await memory.add("assistant", "erste antwort");
    await memory.add("user", "zweite nachricht");
    await memory.add("assistant", "zweite antwort");

    expect(memory.getSummary()).toContain("erste nachricht");
  });

  it("clear() resets both history and summary", async () => {
    const memory = new EpisodicMemory(1);
    await memory.add("user", "a");
    await memory.add("assistant", "b");
    await memory.add("user", "c");
    await memory.add("assistant", "d");
    expect(memory.getSummary()).not.toBe("");

    memory.clear();
    expect(memory.getSummary()).toBe("");
    expect(memory.getContext()).toEqual([]);
  });
});

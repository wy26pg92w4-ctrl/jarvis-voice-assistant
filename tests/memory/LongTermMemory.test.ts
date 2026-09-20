import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LongTermMemory } from "../../src/memory/LongTermMemory.js";

describe("LongTermMemory", () => {
  let dir: string;
  let filePath: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "jarvis-ltm-"));
    filePath = path.join(dir, "facts.json");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("remembers a new fact", async () => {
    const memory = new LongTermMemory(filePath);
    await memory.remember("Lieblingsessen", "Pizza");
    const fact = await memory.get("lieblingsessen");
    expect(fact?.value).toBe("Pizza");
  });

  it("normalizes keys so re-remembering updates in place", async () => {
    const memory = new LongTermMemory(filePath);
    const first = await memory.remember("Lieblingsessen", "Pizza");
    const second = await memory.remember("  LIEBLINGSESSEN  ", "Sushi");

    const facts = await memory.list();
    expect(facts).toHaveLength(1);
    expect(second.id).toBe(first.id);
    expect(facts[0].value).toBe("Sushi");
  });

  it("forgets an existing fact and reports when nothing matched", async () => {
    const memory = new LongTermMemory(filePath);
    await memory.remember("stadt", "Berlin");

    expect(await memory.forget("stadt")).toBe(true);
    expect(await memory.get("stadt")).toBeUndefined();
    expect(await memory.forget("stadt")).toBe(false);
  });

  it("keeps every fact when many are remembered concurrently", async () => {
    const memory = new LongTermMemory(filePath);
    await Promise.all(
      Array.from({ length: 25 }, (_, i) => memory.remember(`fakt-${i}`, `wert-${i}`)),
    );

    const facts = await memory.list();
    expect(facts).toHaveLength(25);
  });

  it("survives being reconstructed from disk (restart durability)", async () => {
    const first = new LongTermMemory(filePath);
    await first.remember("beruf", "Ingenieurin");

    const second = new LongTermMemory(filePath);
    const fact = await second.get("beruf");
    expect(fact?.value).toBe("Ingenieurin");
  });
});

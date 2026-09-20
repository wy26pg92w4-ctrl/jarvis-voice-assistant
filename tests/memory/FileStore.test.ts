import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonFileStore } from "../../src/memory/FileStore.js";

describe("JsonFileStore", () => {
  let dir: string;
  let filePath: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "jarvis-filestore-"));
    filePath = path.join(dir, "nested", "store.json");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns the default value when the file does not exist", async () => {
    const store = new JsonFileStore<string[]>(filePath, []);
    expect(await store.read()).toEqual([]);
  });

  it("persists writes across store instances (restart durability)", async () => {
    const store = new JsonFileStore<string[]>(filePath, []);
    await store.write(["a", "b"]);

    const reopened = new JsonFileStore<string[]>(filePath, []);
    expect(await reopened.read()).toEqual(["a", "b"]);
  });

  it("creates missing parent directories", async () => {
    const store = new JsonFileStore<string[]>(filePath, []);
    await store.write(["x"]);
    const raw = await readFile(filePath, "utf8");
    expect(JSON.parse(raw)).toEqual(["x"]);
  });

  it("recovers from a corrupted file instead of throwing", async () => {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, "{not valid json", "utf8");

    const store = new JsonFileStore<string[]>(filePath, ["fallback"]);
    const value = await store.read();
    expect(value).toEqual(["fallback"]);
  });

  it("loses updates when read() and write() are composed manually under concurrency", async () => {
    // Documents the hazard `update()` exists to avoid: read() and write()
    // are each serialized individually, but the pair is not atomic, so
    // interleaved callers can clobber each other's changes.
    const store = new JsonFileStore<number[]>(filePath, []);
    await store.write([]);

    const increment = async () => {
      const value = await store.read();
      value.push(value.length);
      await store.write(value);
    };

    await Promise.all(Array.from({ length: 20 }, () => increment()));

    const final = await store.read();
    expect(final.length).toBeLessThan(20);
  });

  it("update() serializes concurrent read-modify-write cycles without lost updates", async () => {
    const store = new JsonFileStore<number[]>(filePath, []);

    const increment = () =>
      store.update((current) => {
        current.push(current.length);
        return current;
      });

    await Promise.all(Array.from({ length: 20 }, () => increment()));

    const final = await store.read();
    expect(final).toHaveLength(20);
    expect(new Set(final)).toEqual(new Set(Array.from({ length: 20 }, (_, i) => i)));
  });

  it("documents that two instances on the same path clobber each other via stale caches", async () => {
    // Pins the invariant called out in the class docstring: exactly one
    // JsonFileStore per file path for the process lifetime. If this ever
    // starts passing with equality instead, the cache was made
    // cross-instance-aware and the docstring warning should be removed.
    const first = new JsonFileStore<string[]>(filePath, []);
    const second = new JsonFileStore<string[]>(filePath, []);

    await first.write(["from-first"]);
    await second.write(["from-second"]);

    expect(await first.read()).toEqual(["from-first"]);
    expect(await second.read()).toEqual(["from-second"]);
    expect(await first.read()).not.toEqual(await second.read());
  });
});

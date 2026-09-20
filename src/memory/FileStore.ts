import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Durable JSON persistence for a single value (typically an array of
 * records), scoped to one process. `read`/`write` are individually
 * serialized through an internal queue, but a bare `read()` followed later
 * by `write()` is NOT atomic — another call can run in between and its
 * update gets lost. Use `update()` for any read-modify-write; it queues the
 * whole cycle as one unit. This does not protect against multiple processes
 * writing the same file.
 *
 * The parsed value is cached in memory after the first access and kept in
 * sync on every write, so repeated operations only pay for a disk read
 * once per process lifetime instead of on every call — this matters once a
 * store holds thousands of records (each write is still O(n) to serialize
 * the whole file, but the redundant read+parse before it is not).
 */
export class JsonFileStore<T> {
  private queue: Promise<unknown> = Promise.resolve();
  private cache: T | undefined;
  private cacheLoaded = false;

  constructor(
    private readonly filePath: string,
    private readonly defaultValue: T,
  ) {}

  async read(): Promise<T> {
    return this.enqueue(async () => this.cloneValue(await this.loadCache()));
  }

  async write(value: T): Promise<void> {
    return this.enqueue(() => this.persist(value));
  }

  /** Atomically reads the current value, applies `mutator`, and persists the result. */
  async update(mutator: (current: T) => T | Promise<T>): Promise<T> {
    return this.enqueue(async () => {
      const current = await this.loadCache();
      const next = await mutator(current);
      await this.persist(next);
      return next;
    });
  }

  private enqueue<R>(fn: () => Promise<R>): Promise<R> {
    const result = this.queue.then(fn, fn);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async loadCache(): Promise<T> {
    if (!this.cacheLoaded) {
      this.cache = await this.readInternal();
      this.cacheLoaded = true;
    }
    return this.cache as T;
  }

  private async persist(value: T): Promise<void> {
    await this.writeInternal(value);
    this.cache = value;
    this.cacheLoaded = true;
  }

  private async readInternal(): Promise<T> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return this.cloneDefault();
      }
      throw error;
    }

    try {
      return JSON.parse(raw) as T;
    } catch {
      await this.quarantine();
      return this.cloneDefault();
    }
  }

  private async writeInternal(value: T): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmpPath, JSON.stringify(value, null, 2), "utf8");
    await rename(tmpPath, this.filePath);
  }

  private async quarantine(): Promise<void> {
    try {
      await copyFile(this.filePath, `${this.filePath}.corrupted.${Date.now()}`);
    } catch {
      // Best-effort only; a failed backup must not block recovery.
    }
  }

  private cloneDefault(): T {
    return this.cloneValue(this.defaultValue);
  }

  private cloneValue(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

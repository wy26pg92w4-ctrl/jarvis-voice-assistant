import { afterEach, describe, expect, it, vi } from "vitest";
import { ObsidianRestClient } from "../../src/obsidian/RestClient.js";

describe("ObsidianRestClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("PUTs note content with the auth header and markdown content type", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const client = new ObsidianRestClient("http://127.0.0.1:27123", "secret");
    await client.putNote("Jarvis/Fakten/a.md", "inhalt");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:27123/vault/Jarvis/Fakten/a.md",
      expect.objectContaining({
        method: "PUT",
        body: "inhalt",
        headers: expect.objectContaining({
          Authorization: "Bearer secret",
          "Content-Type": "text/markdown",
        }),
      }),
    );
  });

  it("URL-encodes path segments but keeps slashes as separators", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const client = new ObsidianRestClient("http://127.0.0.1:27123", "secret");
    await client.putNote("Jarvis/Fakten/mein fakt & mehr.md", "x");

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:27123/vault/Jarvis/Fakten/mein%20fakt%20%26%20mehr.md");
  });

  it("getNote returns undefined on a 404 instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const client = new ObsidianRestClient("http://127.0.0.1:27123", "secret");
    expect(await client.getNote("missing.md")).toBeUndefined();
  });

  it("putNote throws on a non-ok, non-404 response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const client = new ObsidianRestClient("http://127.0.0.1:27123", "secret");
    await expect(client.putNote("a.md", "x")).rejects.toThrow(/500/);
  });

  it("isReachable returns false instead of throwing when fetch rejects (Obsidian not running)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const client = new ObsidianRestClient("http://127.0.0.1:27123", "secret");
    expect(await client.isReachable()).toBe(false);
  });

  it("isReachable returns true on an ok root response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    const client = new ObsidianRestClient("http://127.0.0.1:27123", "secret");
    expect(await client.isReachable()).toBe(true);
  });
});

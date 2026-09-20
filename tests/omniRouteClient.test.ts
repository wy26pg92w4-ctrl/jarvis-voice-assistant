import { afterEach, describe, expect, it, vi } from "vitest";
import { OmniRouteClient, OmniRouteError } from "../src/llm/OmniRouteClient.js";

describe("OmniRouteClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends an OpenAI-compatible chat completion request and parses the reply", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "hi there" } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new OmniRouteClient("http://localhost:20128/v1", "secret", "auto");
    const reply = await client.chat([{ role: "user", content: "hello" }]);

    expect(reply).toBe("hi there");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:20128/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer secret" }),
      }),
    );
  });

  it("throws an OmniRouteError on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "boom" }),
    );

    const client = new OmniRouteClient("http://localhost:20128/v1", "secret", "auto");

    await expect(client.chat([{ role: "user", content: "hello" }])).rejects.toThrow(
      OmniRouteError,
    );
  });
});

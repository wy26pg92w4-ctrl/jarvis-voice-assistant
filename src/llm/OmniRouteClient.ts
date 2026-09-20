export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export class OmniRouteError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "OmniRouteError";
  }
}

/**
 * Talks to an OmniRoute instance (https://github.com/diegosouzapw/OmniRoute)
 * through its OpenAI-compatible /chat/completions endpoint. OmniRoute itself
 * handles provider selection, free-tier routing and failover across its
 * catalog, so this client stays a thin OpenAI-style HTTP wrapper.
 */
export class OmniRouteClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async chat(messages: ChatMessage[]): Promise<string> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.model,
        messages,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new OmniRouteError(
        `OmniRoute request failed with status ${response.status}: ${body}`,
        response.status,
      );
    }

    const data = (await response.json()) as ChatCompletionResponse;
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new OmniRouteError("OmniRoute response contained no message content");
    }
    return content;
  }
}

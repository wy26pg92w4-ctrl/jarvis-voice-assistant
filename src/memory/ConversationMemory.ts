import type { ChatMessage } from "../llm/OmniRouteClient.js";

/**
 * Short-term, in-process conversation history. Keeps the most recent
 * `maxTurns` user/assistant exchanges so the LLM gets context without the
 * prompt growing without bound.
 */
export class ConversationMemory {
  private history: ChatMessage[] = [];

  constructor(private readonly maxTurns: number) {}

  add(role: "user" | "assistant", content: string): void {
    this.history.push({ role, content });
    const maxMessages = this.maxTurns * 2;
    if (this.history.length > maxMessages) {
      this.history = this.history.slice(this.history.length - maxMessages);
    }
  }

  getHistory(): ChatMessage[] {
    return [...this.history];
  }

  clear(): void {
    this.history = [];
  }
}

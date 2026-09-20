import type { ChatMessage } from "../llm/OmniRouteClient.js";

export type Summarizer = (messages: ChatMessage[]) => Promise<string>;

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function heuristicSummary(messages: ChatMessage[]): string {
  return messages.map((message) => `${message.role}: ${truncate(message.content, 80)}`).join(" | ");
}

/**
 * Short-term conversation history that, instead of silently dropping the
 * oldest turns once `maxTurns` is exceeded, folds them into a running
 * summary so the LLM keeps the gist of the conversation without the prompt
 * growing without bound. `summarizer` is optional and injectable so tests
 * (and gateway-outage fallback) don't depend on a live LLM call.
 */
export class EpisodicMemory {
  private history: ChatMessage[] = [];
  private summary = "";

  constructor(
    private readonly maxTurns: number,
    private readonly summarizer?: Summarizer,
  ) {}

  async add(role: "user" | "assistant", content: string): Promise<void> {
    this.history.push({ role, content });
    const maxMessages = this.maxTurns * 2;
    if (this.history.length > maxMessages) {
      // Evict down to half the buffer rather than the bare minimum: a
      // minimal per-message trim would re-trigger summarization (an LLM
      // call) on almost every single turn once the buffer is full, which is
      // both slow and needlessly expensive. Batching the eviction amortizes
      // that cost across roughly half the buffer's worth of turns.
      const retainCount = Math.max(1, Math.ceil(maxMessages / 2));
      const overflowCount = this.history.length - retainCount;
      const overflow = this.history.slice(0, overflowCount);
      this.history = this.history.slice(overflowCount);
      this.summary = await this.foldIntoSummary(overflow);
    }
  }

  private async foldIntoSummary(overflow: ChatMessage[]): Promise<string> {
    if (this.summarizer) {
      try {
        // Contract: the summarizer receives the prior summary (if any) plus
        // the overflow turns and returns the complete, updated summary.
        const context = this.summary
          ? [{ role: "system" as const, content: `Bisherige Zusammenfassung: ${this.summary}` }, ...overflow]
          : overflow;
        const summarized = await this.summarizer(context);
        if (summarized.trim().length === 0) {
          // A blank reply is not a valid "complete updated summary" — trusting
          // it would silently erase everything accumulated so far. Treat it
          // like a failure and fall through to the additive heuristic below.
          throw new Error("summarizer returned a blank summary");
        }
        return summarized;
      } catch {
        // Gateway unreachable or malformed reply: degrade to the heuristic below.
      }
    }
    const heuristic = heuristicSummary(overflow);
    return this.summary ? `${this.summary}\n${heuristic}` : heuristic;
  }

  getContext(): ChatMessage[] {
    const messages: ChatMessage[] = [];
    if (this.summary) {
      messages.push({
        role: "system",
        content: `Zusammenfassung des bisherigen Gesprächs:\n${this.summary}`,
      });
    }
    messages.push(...this.history);
    return messages;
  }

  getSummary(): string {
    return this.summary;
  }

  getRecentHistory(): ChatMessage[] {
    return [...this.history];
  }

  clear(): void {
    this.history = [];
    this.summary = "";
  }
}

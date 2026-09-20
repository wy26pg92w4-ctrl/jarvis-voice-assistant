function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

/**
 * Fraction of the query's distinct tokens that also appear in the document.
 * Dependency-free stand-in for embedding similarity: deterministic and
 * network-free, which matters for the memory retrieval to stay testable and
 * usable even when the LLM gateway is unreachable.
 */
export function scoreRelevance(query: string, document: string): number {
  const queryTokens = new Set(tokenize(query));
  if (queryTokens.size === 0) {
    return 0;
  }
  const docTokens = new Set(tokenize(document));
  let overlap = 0;
  for (const token of queryTokens) {
    if (docTokens.has(token)) {
      overlap += 1;
    }
  }
  return overlap / queryTokens.size;
}

export function rankByRelevance<T>(
  query: string,
  items: T[],
  toText: (item: T) => string,
  limit: number,
): T[] {
  return items
    .map((item) => ({ item, score: scoreRelevance(query, toText(item)) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.item);
}

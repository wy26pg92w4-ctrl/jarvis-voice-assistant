import { describe, expect, it } from "vitest";
import { rankByRelevance, scoreRelevance } from "../../src/memory/retrieval.js";

describe("scoreRelevance", () => {
  it("scores 0 for completely unrelated text", () => {
    expect(scoreRelevance("Wetter", "Pizza schmeckt gut")).toBe(0);
  });

  it("scores 1 when every query token appears in the document", () => {
    expect(scoreRelevance("lieblingsessen", "mein lieblingsessen ist pizza")).toBe(1);
  });

  it("is case-insensitive and ignores punctuation", () => {
    expect(scoreRelevance("Pizza!", "ich mag PIZZA sehr")).toBe(1);
  });

  it("returns 0 for an empty query", () => {
    expect(scoreRelevance("", "irgendein text")).toBe(0);
  });
});

describe("rankByRelevance", () => {
  const facts = [
    { key: "lieblingsessen", value: "pizza" },
    { key: "lieblingsfarbe", value: "blau" },
    { key: "wohnort", value: "berlin" },
  ];

  it("ranks the most relevant items first and drops zero-score items", () => {
    const ranked = rankByRelevance("was ist mein lieblingsessen", facts, (f) => `${f.key} ${f.value}`, 5);
    expect(ranked[0].key).toBe("lieblingsessen");
    expect(ranked).not.toContainEqual(expect.objectContaining({ key: "wohnort" }));
  });

  it("respects the limit", () => {
    const ranked = rankByRelevance("lieblingsessen lieblingsfarbe wohnort berlin pizza blau", facts, (f) => `${f.key} ${f.value}`, 2);
    expect(ranked).toHaveLength(2);
  });
});

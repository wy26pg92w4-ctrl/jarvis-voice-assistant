import { describe, expect, it } from "vitest";
import {
  factNotePath,
  formatFactNote,
  formatIndexNote,
  formatReminderNote,
  parseFactNote,
  reminderNotePath,
  slugify,
} from "../../src/obsidian/noteFormat.js";
import type { Fact, Reminder } from "../../src/memory/types.js";

describe("slugify", () => {
  it("lowercases, transliterates umlauts and replaces separators with hyphens", () => {
    expect(slugify("Mein Lieblingsessen", "x")).toBe("mein-lieblingsessen");
    expect(slugify("Größe & Übung", "x")).toBe("groesse-uebung");
  });

  it("falls back when nothing alphanumeric survives", () => {
    expect(slugify("!!!", "unbenannt")).toBe("unbenannt");
    expect(slugify("", "unbenannt")).toBe("unbenannt");
  });
});

describe("fact notes", () => {
  const fact: Fact = {
    id: "abc-123",
    key: "lieblingsessen",
    value: "pizza",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  };

  it("formats a fact note with frontmatter, body and a backlink", () => {
    const note = formatFactNote(fact);
    expect(note).toContain("jarvis_type: fact");
    expect(note).toContain("jarvis_key: lieblingsessen");
    expect(note).toContain("# lieblingsessen");
    expect(note).toContain("pizza");
    expect(note).toContain("[[Jarvis Gedächtnis]]");
  });

  it("round-trips key/value through parseFactNote", () => {
    const note = formatFactNote(fact);
    expect(parseFactNote(note)).toEqual({ key: "lieblingsessen", value: "pizza" });
  });

  it("round-trips a value containing special characters and multiple lines", () => {
    const tricky: Fact = { ...fact, key: "notiz", value: 'mehrzeilig\nmit "Anführungszeichen" und : Doppelpunkt' };
    const note = formatFactNote(tricky);
    expect(parseFactNote(note)?.value).toBe(tricky.value);
  });

  it("returns undefined for a note without Jarvis frontmatter", () => {
    expect(parseFactNote("# Irgendeine andere Notiz\n\nText")).toBeUndefined();
  });

  it("derives a stable, filesystem-safe path from the key", () => {
    expect(factNotePath({ key: "Mein Lieblingsessen" })).toBe("Jarvis/Fakten/mein-lieblingsessen.md");
  });
});

describe("reminder notes", () => {
  const reminder: Reminder = {
    id: "11111111-2222-3333-4444-555555555555",
    message: "Kaffee holen",
    triggerType: "time",
    dueAt: "2026-01-01T10:00:00.000Z",
    createdAt: "2026-01-01T09:00:00.000Z",
    firedAt: null,
  };

  it("shows an open checkbox for a pending reminder", () => {
    const note = formatReminderNote(reminder);
    expect(note).toContain("- [ ] Kaffee holen");
  });

  it("shows a checked checkbox once fired", () => {
    const note = formatReminderNote({ ...reminder, firedAt: "2026-01-01T10:00:01.000Z" });
    expect(note).toContain("- [x] Kaffee holen");
  });

  it("includes the id suffix so the path stays stable across edits", () => {
    const path1 = reminderNotePath(reminder);
    const path2 = reminderNotePath({ ...reminder, firedAt: "2026-01-01T10:00:01.000Z" });
    expect(path1).toBe(path2);
    expect(path1).toContain("11111111");
  });
});

describe("formatIndexNote", () => {
  it("lists provided slugs and shows placeholders when empty", () => {
    const withEntries = formatIndexNote(["lieblingsessen"], []);
    expect(withEntries).toContain("[[Jarvis/Fakten/lieblingsessen|lieblingsessen]]");
    expect(withEntries).toContain("_Keine Erinnerungen._");

    const empty = formatIndexNote([], []);
    expect(empty).toContain("_Noch keine Fakten gespeichert._");
  });
});

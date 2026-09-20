import { describe, expect, it } from "vitest";
import { PLANNED_FLOWS, buildChoice } from "../../scripts/obsidian-quickadd-setup.js";

describe("PLANNED_FLOWS", () => {
  it("matches the three requested flows exactly", () => {
    expect(PLANNED_FLOWS).toEqual([
      { name: "Neue Notiz", templatePath: "vorlagen/Notiz.md", targetFolder: "10-notizen" },
      { name: "Neue MOC", templatePath: "vorlagen/MOC.md", targetFolder: "20-mocs" },
      { name: "Schneller Gedanke", templatePath: "vorlagen/Notiz.md", targetFolder: "00-inbox" },
    ]);
  });
});

describe("buildChoice", () => {
  it("builds a QuickAdd Template choice with a fresh id and the right target folder", () => {
    const choice = buildChoice(PLANNED_FLOWS[0]);
    expect(choice.name).toBe("Neue Notiz");
    expect(choice.type).toBe("Template");
    expect(choice.templatePath).toBe("vorlagen/Notiz.md");
    expect(choice.folder.folders).toEqual(["10-notizen"]);
    expect(choice.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("gives each call a distinct id", () => {
    const a = buildChoice(PLANNED_FLOWS[0]);
    const b = buildChoice(PLANNED_FLOWS[0]);
    expect(a.id).not.toBe(b.id);
  });
});

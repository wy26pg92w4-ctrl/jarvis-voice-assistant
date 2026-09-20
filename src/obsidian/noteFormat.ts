import type { Fact, Reminder } from "../memory/types.js";

export const FACTS_FOLDER = "Jarvis/Fakten";
export const REMINDERS_FOLDER = "Jarvis/Erinnerungen";
export const JOURNAL_FOLDER = "Jarvis/Journal";
export const INDEX_NOTE_PATH = "Jarvis/Jarvis Gedächtnis.md";
export const INDEX_NOTE_NAME = "Jarvis Gedächtnis";

const UMLAUT_MAP: Record<string, string> = {
  ä: "ae",
  ö: "oe",
  ü: "ue",
  ß: "ss",
};

/** Filesystem- and Obsidian-link-safe slug derived from arbitrary text. */
export function slugify(text: string, fallback: string): string {
  const transliterated = text
    .toLowerCase()
    .replace(/[äöüß]/g, (char) => UMLAUT_MAP[char] ?? char);
  const slug = transliterated
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || fallback;
}

function frontmatter(fields: Record<string, string>): string {
  const lines = Object.entries(fields).map(([key, value]) => `${key}: ${yamlScalar(value)}`);
  return `---\n${lines.join("\n")}\n---\n`;
}

function yamlScalar(value: string): string {
  if (value === "" || /[:#\[\]{}"'\n]/.test(value) || value !== value.trim()) {
    return JSON.stringify(value);
  }
  return value;
}

export function factNotePath(fact: Pick<Fact, "key">): string {
  return `${FACTS_FOLDER}/${slugify(fact.key, fact.key.length > 0 ? "fakt" : "unbenannt")}.md`;
}

export function formatFactNote(fact: Fact): string {
  const fm = frontmatter({
    jarvis_type: "fact",
    jarvis_key: fact.key,
    jarvis_id: fact.id,
    created: fact.createdAt,
    updated: fact.updatedAt,
    tags: "jarvis/fakt",
  });
  return `${fm}\n# ${fact.key}\n\n${fact.value}\n\n---\nVerknüpft: [[${INDEX_NOTE_NAME}]]\n`;
}

/** Reads a fact note's frontmatter + body back into key/value, for import. */
export function parseFactNote(content: string): { key: string; value: string } | undefined {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!fmMatch) {
    return undefined;
  }
  const fields = parseFrontmatterFields(fmMatch[1]);
  if (fields.jarvis_type !== "fact" || !fields.jarvis_key) {
    return undefined;
  }
  const body = content.slice(fmMatch[0].length);
  const value = body
    .replace(/^\s*#[^\n]*\n+/, "")
    .replace(/\n+---\nVerknüpft:.*$/s, "")
    .trim();
  return { key: fields.jarvis_key, value };
}

function parseFrontmatterFields(raw: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const match = line.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    fields[key] = decodeYamlScalar(rawValue.trim());
  }
  return fields;
}

function decodeYamlScalar(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value) as string;
    } catch {
      return value;
    }
  }
  return value;
}

export function reminderNotePath(reminder: Pick<Reminder, "id" | "message">): string {
  return `${REMINDERS_FOLDER}/${slugify(reminder.message, "erinnerung")}-${reminder.id.slice(0, 8)}.md`;
}

export function formatReminderNote(reminder: Reminder): string {
  const dueLabel = reminder.dueAt ? new Date(reminder.dueAt).toLocaleString("de-DE") : reminder.eventName ?? "unbekannt";
  const checkbox = reminder.firedAt ? "[x]" : "[ ]";
  const fm = frontmatter({
    jarvis_type: "reminder",
    jarvis_id: reminder.id,
    trigger_type: reminder.triggerType,
    due: reminder.dueAt ?? "",
    event: reminder.eventName ?? "",
    fired: reminder.firedAt ?? "",
    tags: "jarvis/erinnerung",
  });
  return (
    `${fm}\n# Erinnerung: ${reminder.message}\n\n` +
    `- ${checkbox} ${reminder.message} (fällig: ${dueLabel})\n\n` +
    `---\nVerknüpft: [[${INDEX_NOTE_NAME}]]\n`
  );
}

export function journalNotePath(date: Date): string {
  const iso = date.toISOString().slice(0, 10);
  return `${JOURNAL_FOLDER}/${iso}.md`;
}

export function formatJournalEntryAppend(summary: string, at: Date): string {
  const time = at.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  return `## ${time}\n\n${summary}\n`;
}

export function formatJournalNoteHeader(date: Date): string {
  const day = date.toLocaleDateString("de-DE", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const fm = frontmatter({ jarvis_type: "journal", tags: "jarvis/journal" });
  return `${fm}\n# ${day}\n\nVerknüpft: [[${INDEX_NOTE_NAME}]]\n\n`;
}

export function formatIndexNote(factSlugs: string[], reminderSlugs: string[]): string {
  const fm = frontmatter({ jarvis_type: "index", tags: "jarvis/index" });
  const factLinks = factSlugs.length > 0
    ? factSlugs.map((slug) => `- [[${FACTS_FOLDER}/${slug}|${slug}]]`).join("\n")
    : "_Noch keine Fakten gespeichert._";
  const reminderLinks = reminderSlugs.length > 0
    ? reminderSlugs.map((slug) => `- [[${REMINDERS_FOLDER}/${slug}|${slug}]]`).join("\n")
    : "_Keine Erinnerungen._";
  return (
    `${fm}\n# Jarvis Gedächtnis\n\n` +
    `Automatisch von Jarvis gepflegte Übersicht. Nicht von Hand die Links pflegen — ` +
    `diese Notiz wird bei jeder Änderung neu aus \`${FACTS_FOLDER}\`/\`${REMINDERS_FOLDER}\` erzeugt.\n\n` +
    `## Fakten\n\n${factLinks}\n\n` +
    `## Erinnerungen\n\n${reminderLinks}\n\n` +
    `## Journal\n\nTägliche Gesprächszusammenfassungen liegen in \`${JOURNAL_FOLDER}/\`.\n`
  );
}

import type { LongTermMemory } from "../../memory/LongTermMemory.js";
import type { ReminderStore } from "../../memory/ReminderStore.js";
import { rankByRelevance } from "../../memory/retrieval.js";
import type { Skill } from "../Skill.js";

const REMEMBER_TRIGGER = /^merke? dir\b\s*(.*)$/i;
const LEADING_SEPARATOR = /^[:,]\s*/;
const KEY_VALUE_SPLIT = /^(.+?)\s+ist\s+(.+)$/i;
const FORGET_TRIGGER = /^vergiss\s+(.+)/i;
const RECALL_TRIGGER = /^was wei(ß|ss)t du (?:über|zu)\s+(.+)/i;
const REMIND_TRIGGER = /^erinnere mich in\s+(\d+)\s*(minute|minuten|stunde|stunden)\s+(?:an|dass)\s+(.+)/i;

const UNIT_TO_MS: Record<string, number> = {
  minute: 60_000,
  minuten: 60_000,
  stunde: 3_600_000,
  stunden: 3_600_000,
};

export function createRememberSkill(longTerm: LongTermMemory): Skill {
  return {
    name: "remember",
    description: "Speichert einen Fakt dauerhaft, z. B. 'merke dir mein lieblingsessen ist pizza'.",
    canHandle: (input) => REMEMBER_TRIGGER.test(input.trim()),
    handle: async (input) => {
      const match = input.trim().match(REMEMBER_TRIGGER);
      const captured = match?.[1] ?? "";
      const statement = captured.replace(LEADING_SEPARATOR, "").trim();
      const kv = statement.match(KEY_VALUE_SPLIT);
      const key = kv ? kv[1].trim() : `notiz vom ${new Date().toLocaleString("de-DE")}`;
      const value = kv ? kv[2].trim() : statement;
      if (!value) {
        return "Was genau soll ich mir merken?";
      }
      await longTerm.remember(key, value);
      return `Gemerkt: ${key} = ${value}`;
    },
  };
}

export function createForgetSkill(longTerm: LongTermMemory): Skill {
  return {
    name: "forget",
    description: "Löscht einen zuvor gespeicherten Fakt, z. B. 'vergiss mein lieblingsessen'.",
    canHandle: (input) => FORGET_TRIGGER.test(input.trim()),
    handle: async (input) => {
      const match = input.trim().match(FORGET_TRIGGER);
      const key = match?.[1]?.trim() ?? "";
      const removed = key ? await longTerm.forget(key) : false;
      return removed ? `Erledigt, ich habe "${key}" vergessen.` : `Dazu habe ich nichts unter "${key}" gespeichert.`;
    },
  };
}

export function createRecallSkill(longTerm: LongTermMemory): Skill {
  return {
    name: "recall",
    description: "Ruft gespeichertes Wissen ab, z. B. 'was weißt du über lieblingsessen'.",
    canHandle: (input) => RECALL_TRIGGER.test(input.trim()),
    handle: async (input) => {
      const match = input.trim().match(RECALL_TRIGGER);
      const topic = match?.[2]?.trim() ?? "";
      const facts = await longTerm.list();
      const matches = rankByRelevance(topic, facts, (fact) => `${fact.key} ${fact.value}`, 3);
      if (matches.length === 0) {
        return `Dazu habe ich noch nichts gespeichert.`;
      }
      return matches.map((fact) => `${fact.key}: ${fact.value}`).join("\n");
    },
  };
}

export function createRemindSkill(reminders: ReminderStore): Skill {
  return {
    name: "remind",
    description: "Legt eine Erinnerung an, z. B. 'erinnere mich in 10 minuten an den Kaffee'.",
    canHandle: (input) => REMIND_TRIGGER.test(input.trim()),
    handle: async (input) => {
      const match = input.trim().match(REMIND_TRIGGER);
      if (!match) {
        return "Das habe ich nicht verstanden.";
      }
      const amount = Number(match[1]);
      const unit = match[2].toLowerCase();
      const message = match[3].trim();
      const dueAt = new Date(Date.now() + amount * UNIT_TO_MS[unit]);
      await reminders.createTimeReminder(message, dueAt);
      return `Okay, ich erinnere dich am ${dueAt.toLocaleString("de-DE")} an: ${message}`;
    },
  };
}

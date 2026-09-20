import type { Skill } from "../Skill.js";

const TRIGGER = /\b(wie spät|uhrzeit|what time)\b/i;

export const timeSkill: Skill = {
  name: "time",
  description: "Nennt die aktuelle Uhrzeit.",
  canHandle: (input) => TRIGGER.test(input),
  handle: () => {
    const now = new Date();
    return `Es ist gerade ${now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr.`;
  },
};

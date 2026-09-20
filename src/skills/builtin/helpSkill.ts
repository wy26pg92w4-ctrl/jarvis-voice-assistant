import type { Skill } from "../Skill.js";
import type { SkillRegistry } from "../SkillRegistry.js";

const TRIGGER = /\b(hilfe|was kannst du|help)\b/i;

export function createHelpSkill(registry: SkillRegistry): Skill {
  return {
    name: "help",
    description: "Listet die verfügbaren Skills auf.",
    canHandle: (input) => TRIGGER.test(input),
    handle: () => {
      const names = registry
        .list()
        .map((skill) => `- ${skill.name}: ${skill.description}`)
        .join("\n");
      return `Ich kann direkt folgende Skills bedienen:\n${names}\nAlles andere beantworte ich über mein Sprachmodell.`;
    },
  };
}

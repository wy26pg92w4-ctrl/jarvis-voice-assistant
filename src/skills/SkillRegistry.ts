import type { Skill } from "./Skill.js";

export class SkillRegistry {
  private skills: Skill[] = [];

  register(skill: Skill): void {
    this.skills.push(skill);
  }

  find(input: string): Skill | undefined {
    return this.skills.find((skill) => skill.canHandle(input));
  }

  list(): Skill[] {
    return [...this.skills];
  }
}

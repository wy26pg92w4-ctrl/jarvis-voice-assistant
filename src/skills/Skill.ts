export interface Skill {
  name: string;
  description: string;
  canHandle(input: string): boolean;
  handle(input: string): string | Promise<string>;
}

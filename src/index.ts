import readline from "node:readline";
import { stdin, stdout } from "node:process";
import { loadConfig } from "./config.js";
import { OmniRouteClient } from "./llm/OmniRouteClient.js";
import { ConversationMemory } from "./memory/ConversationMemory.js";
import { SkillRegistry } from "./skills/SkillRegistry.js";
import { timeSkill } from "./skills/builtin/timeSkill.js";
import { createHelpSkill } from "./skills/builtin/helpSkill.js";
import { Brain } from "./brain/Brain.js";

function buildBrain(): Brain {
  const config = loadConfig();
  const llm = new OmniRouteClient(config.omniRouteBaseUrl, config.omniRouteApiKey, config.model);
  const memory = new ConversationMemory(config.memoryTurns);
  const skills = new SkillRegistry();
  skills.register(timeSkill);
  skills.register(createHelpSkill(skills));
  return new Brain(llm, memory, skills, config.systemPrompt);
}

async function main(): Promise<void> {
  const brain = buildBrain();
  const rl = readline.createInterface({ input: stdin, output: stdout });

  console.log("Jarvis-Gehirn bereit. Tippe eine Nachricht (oder 'exit' zum Beenden).");
  rl.setPrompt("> ");
  rl.prompt();

  for await (const line of rl) {
    if (line.trim().toLowerCase() === "exit") {
      break;
    }
    try {
      const reply = await brain.respond(line);
      console.log(reply);
    } catch (error) {
      console.error("Fehler bei der Antwortgenerierung:", (error as Error).message);
    }
    rl.prompt();
  }
  rl.close();
}

main();

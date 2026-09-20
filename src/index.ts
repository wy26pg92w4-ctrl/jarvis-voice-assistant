import readline from "node:readline";
import { stdin, stdout } from "node:process";
import { loadConfig } from "./config.js";
import { OmniRouteClient, type ChatMessage } from "./llm/OmniRouteClient.js";
import { EpisodicMemory, type Summarizer } from "./memory/EpisodicMemory.js";
import { LongTermMemory } from "./memory/LongTermMemory.js";
import { ReminderStore } from "./memory/ReminderStore.js";
import { MemoryManager } from "./memory/MemoryManager.js";
import { SkillRegistry } from "./skills/SkillRegistry.js";
import { timeSkill } from "./skills/builtin/timeSkill.js";
import { createHelpSkill } from "./skills/builtin/helpSkill.js";
import {
  createForgetSkill,
  createRecallSkill,
  createRememberSkill,
  createRemindSkill,
} from "./skills/builtin/memorySkills.js";
import { Brain } from "./brain/Brain.js";

function createOmniRouteSummarizer(llm: OmniRouteClient): Summarizer {
  return async (messages: ChatMessage[]): Promise<string> => {
    const transcript = messages.map((message) => `${message.role}: ${message.content}`).join("\n");
    return llm.chat([
      {
        role: "system",
        content:
          "Fasse den folgenden Gesprächsausschnitt für dein zukünftiges Ich in 3-5 knappen Sätzen zusammen. " +
          "Nenne nur Fakten, Entscheidungen und offene Punkte, die für spätere Antworten wichtig sind.",
      },
      { role: "user", content: transcript },
    ]);
  };
}

function buildBrain(): Brain {
  const config = loadConfig();
  const llm = new OmniRouteClient(config.omniRouteBaseUrl, config.omniRouteApiKey, config.model);
  const episodic = new EpisodicMemory(config.memoryTurns, createOmniRouteSummarizer(llm));
  const longTerm = new LongTermMemory(config.factsFile);
  const reminders = new ReminderStore(config.remindersFile);
  const memory = new MemoryManager(episodic, longTerm, reminders);

  const skills = new SkillRegistry();
  skills.register(timeSkill);
  skills.register(createRememberSkill(longTerm));
  skills.register(createForgetSkill(longTerm));
  skills.register(createRecallSkill(longTerm));
  skills.register(createRemindSkill(reminders));
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

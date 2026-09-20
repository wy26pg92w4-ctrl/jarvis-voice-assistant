import "dotenv/config";
import path from "node:path";

export interface JarvisConfig {
  omniRouteBaseUrl: string;
  omniRouteApiKey: string;
  model: string;
  memoryTurns: number;
  systemPrompt: string;
  dataDir: string;
  factsFile: string;
  remindersFile: string;
  obsidian?: {
    vaultPath: string;
    restUrl?: string;
    restApiKey?: string;
  };
}

function readInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): JarvisConfig {
  const dataDir = env.JARVIS_DATA_DIR ?? "./data";
  return {
    omniRouteBaseUrl: env.OMNIROUTE_BASE_URL ?? "http://localhost:20128/v1",
    omniRouteApiKey: env.OMNIROUTE_API_KEY ?? "",
    model: env.JARVIS_MODEL ?? "auto",
    memoryTurns: readInt(env.JARVIS_MEMORY_TURNS, 20),
    systemPrompt:
      env.JARVIS_SYSTEM_PROMPT ??
      "Du bist Jarvis, ein hilfsbereiter Sprachassistent. Antworte kurz und klar auf Deutsch, außer der Nutzer wechselt die Sprache.",
    dataDir,
    factsFile: path.join(dataDir, "facts.json"),
    remindersFile: path.join(dataDir, "reminders.json"),
    obsidian: env.JARVIS_OBSIDIAN_VAULT_PATH
      ? {
          vaultPath: env.JARVIS_OBSIDIAN_VAULT_PATH,
          restUrl: env.JARVIS_OBSIDIAN_REST_URL || undefined,
          restApiKey: env.JARVIS_OBSIDIAN_REST_API_KEY || undefined,
        }
      : undefined,
  };
}

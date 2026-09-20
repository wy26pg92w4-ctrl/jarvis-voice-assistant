/**
 * Adds the 3 planned QuickAdd flows (Neue Notiz, Neue MOC, Schneller
 * Gedanke) to an existing QuickAdd plugin config. Merge-only: it reads the
 * vault's current .obsidian/plugins/quickadd/data.json (if any), appends
 * choices that aren't already there by name, and writes the file back —
 * every other setting in that file is left untouched.
 *
 * Requires the QuickAdd plugin to be installed at least once in the vault
 * (so its plugin folder exists) — this script does not install plugins.
 * Reload Obsidian (or toggle the plugin off/on) afterwards to pick up the
 * change, and double-check the 3 flows in QuickAdd's settings, since the
 * exact JSON shape can shift slightly between plugin versions.
 *
 * Usage:
 *   npx tsx scripts/obsidian-quickadd-setup.ts --vault /pfad/zum/vault [--write]
 */
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

interface TemplateChoice {
  id: string;
  name: string;
  type: "Template";
  templatePath: string;
  folder: {
    folders: string[];
    chooseWhenCreatingNote: boolean;
    createInSameFolderAsActiveFile: boolean;
    chooseFolderWhenCreatingNote: boolean;
  };
  fileNameFormat: { enabled: boolean; format: string };
  appendLink: boolean;
  incrementFileName: boolean;
  openFile: boolean;
  openFileInNewTab: { enabled: boolean; direction: "vertical" | "horizontal" };
  command: boolean;
}

export const PLANNED_FLOWS: Array<Pick<TemplateChoice, "name" | "templatePath"> & { targetFolder: string }> = [
  { name: "Neue Notiz", templatePath: "vorlagen/Notiz.md", targetFolder: "10-notizen" },
  { name: "Neue MOC", templatePath: "vorlagen/MOC.md", targetFolder: "20-mocs" },
  { name: "Schneller Gedanke", templatePath: "vorlagen/Notiz.md", targetFolder: "00-inbox" },
];

export function buildChoice(flow: (typeof PLANNED_FLOWS)[number]): TemplateChoice {
  return {
    id: randomUUID(),
    name: flow.name,
    type: "Template",
    templatePath: flow.templatePath,
    folder: {
      folders: [flow.targetFolder],
      chooseWhenCreatingNote: false,
      createInSameFolderAsActiveFile: false,
      chooseFolderWhenCreatingNote: false,
    },
    fileNameFormat: { enabled: false, format: "" },
    appendLink: false,
    incrementFileName: false,
    openFile: true,
    openFileInNewTab: { enabled: false, direction: "vertical" },
    command: false,
  };
}

interface Args {
  vaultPath: string;
  write: boolean;
}

function parseArgs(argv: string[]): Args {
  const vaultIndex = argv.indexOf("--vault");
  const vaultPath = vaultIndex >= 0 ? argv[vaultIndex + 1] : undefined;
  if (!vaultPath) {
    console.error("Usage: obsidian-quickadd-setup --vault /pfad/zum/vault [--write]");
    process.exit(1);
  }
  return { vaultPath, write: argv.includes("--write") };
}

async function main(): Promise<void> {
  const { vaultPath, write } = parseArgs(process.argv.slice(2));
  const dataPath = path.join(vaultPath, ".obsidian", "plugins", "quickadd", "data.json");

  let config: { choices?: Array<{ name: string }>; [key: string]: unknown };
  try {
    config = JSON.parse(await readFile(dataPath, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      console.error(
        `Keine QuickAdd-Konfiguration gefunden unter ${dataPath}.\n` +
          "Installiere/aktiviere das QuickAdd-Plugin in Obsidian mindestens einmal, bevor du dieses Skript laufen lässt.",
      );
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  const existingChoices = config.choices ?? [];
  const existingNames = new Set(existingChoices.map((choice) => choice.name));
  const missingFlows = PLANNED_FLOWS.filter((flow) => !existingNames.has(flow.name));

  if (missingFlows.length === 0) {
    console.log("Alle 3 geplanten Flows existieren bereits (nach Name geprüft) — nichts zu tun.");
    return;
  }

  console.log(`Fehlende Flows: ${missingFlows.map((flow) => flow.name).join(", ")}`);

  if (!write) {
    console.log("\nDry-Run — keine Datei wurde verändert. Mit --write tatsächlich schreiben.");
    return;
  }

  const backupPath = `${dataPath}.bak-${Date.now()}`;
  await mkdir(path.dirname(backupPath), { recursive: true });
  await copyFile(dataPath, backupPath);

  config.choices = [...existingChoices, ...missingFlows.map(buildChoice)];
  await writeFile(dataPath, JSON.stringify(config, null, 2), "utf8");

  console.log(`\n${missingFlows.length} Flow(s) ergänzt. Backup der Originaldatei: ${backupPath}`);
  console.log("Obsidian neu laden (oder QuickAdd aus-/einschalten), damit die Änderung wirksam wird.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("QuickAdd-Setup fehlgeschlagen:", error);
    process.exitCode = 1;
  });
}

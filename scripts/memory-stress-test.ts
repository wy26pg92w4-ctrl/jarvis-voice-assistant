/**
 * Hardening / stress test for the Jarvis memory subsystem. Not a unit test —
 * this pushes realistic-to-extreme volume and concurrency through the real
 * file-backed stores and reports timings, so regressions in scale or
 * concurrency safety show up before they hit production data.
 *
 * Run with: npm run stress:memory
 */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { EpisodicMemory } from "../src/memory/EpisodicMemory.js";
import { LongTermMemory } from "../src/memory/LongTermMemory.js";
import { MemoryManager } from "../src/memory/MemoryManager.js";
import { ReminderStore } from "../src/memory/ReminderStore.js";
import { Brain } from "../src/brain/Brain.js";
import { SkillRegistry } from "../src/skills/SkillRegistry.js";
import type { OmniRouteClient } from "../src/llm/OmniRouteClient.js";

interface Result {
  name: string;
  ms: number;
  detail?: string;
}

const results: Result[] = [];

async function timed(name: string, fn: () => Promise<string | void>): Promise<void> {
  const start = performance.now();
  const detail = (await fn()) ?? undefined;
  const ms = performance.now() - start;
  results.push({ name, ms, detail });
  console.log(`  ${ms >= 1000 ? (ms / 1000).toFixed(2) + "s" : ms.toFixed(1) + "ms"}  ${name}${detail ? ` (${detail})` : ""}`);
}

function fakeLlm(reply: string): OmniRouteClient {
  return { chat: async () => reply } as unknown as OmniRouteClient;
}

async function main(): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "jarvis-stress-"));
  console.log(`Arbeitsverzeichnis: ${dir}\n`);

  try {
    console.log("1) LongTermMemory unter Last");
    const longTerm = new LongTermMemory(path.join(dir, "facts.json"));
    const FACT_COUNT = 5000;

    await timed(`${FACT_COUNT} Fakten sequentiell speichern`, async () => {
      for (let i = 0; i < FACT_COUNT; i++) {
        await longTerm.remember(`fakt-${i}`, `wert-${i}`);
      }
    });

    const afterSequential = await longTerm.list();
    assert.equal(afterSequential.length, FACT_COUNT, "sequentielles Speichern darf keine Fakten verlieren");

    const CONCURRENT_COUNT = 2000;
    await timed(`${CONCURRENT_COUNT} weitere Fakten gleichzeitig (Promise.all) speichern`, async () => {
      await Promise.all(
        Array.from({ length: CONCURRENT_COUNT }, (_, i) => longTerm.remember(`concurrent-${i}`, `wert-${i}`)),
      );
    });

    const afterConcurrent = await longTerm.list();
    assert.equal(
      afterConcurrent.length,
      FACT_COUNT + CONCURRENT_COUNT,
      "gleichzeitiges Speichern darf keine Updates verlieren (Regressionstest für den FileStore-Race)",
    );

    await timed("Relevanzsuche über alle Fakten (rankByRelevance)", async () => {
      const memory = new MemoryManager(new EpisodicMemory(10), longTerm, new ReminderStore(path.join(dir, "unused.json")));
      const { messages } = await memory.prepareTurn("was ist fakt-2500?", "system");
      const found = messages.some((m) => m.content.includes("fakt-2500"));
      assert.ok(found, "die Relevanzsuche muss den passenden Fakt unter 7000 Einträgen finden");
      return `Treffer gefunden: ${found}`;
    });

    console.log("\n2) ReminderStore unter Last");
    const reminders = new ReminderStore(path.join(dir, "reminders.json"));
    const REMINDER_COUNT = 3000;
    await timed(`${REMINDER_COUNT} Erinnerungen anlegen (halb fällig, halb zukünftig)`, async () => {
      await Promise.all(
        Array.from({ length: REMINDER_COUNT }, (_, i) => {
          const due = i % 2 === 0 ? new Date(Date.now() - 1000) : new Date(Date.now() + 3_600_000);
          return reminders.createTimeReminder(`Erinnerung ${i}`, due);
        }),
      );
    });
    assert.equal((await reminders.list()).length, REMINDER_COUNT);

    let due: Awaited<ReturnType<ReminderStore["dueReminders"]>> = [];
    await timed("fällige Erinnerungen herausfiltern", async () => {
      due = await reminders.dueReminders();
      return `${due.length} fällig`;
    });
    assert.equal(due.length, REMINDER_COUNT / 2, "genau die Hälfte der Erinnerungen sollte fällig sein");

    await timed("alle fälligen Erinnerungen als erledigt markieren", async () => {
      await Promise.all(due.map((reminder) => reminders.markFired(reminder.id)));
    });
    assert.equal((await reminders.dueReminders()).length, 0, "nach dem Markieren darf nichts mehr fällig sein");

    console.log("\n3) EpisodicMemory über eine lange Konversation");
    const TURN_COUNT = 4000;
    let summarizerCalls = 0;
    const episodic = new EpisodicMemory(20, async (msgs) => {
      summarizerCalls += 1;
      return `Zusammenfassung nach ${summarizerCalls} Verdichtungen (${msgs.length} Nachrichten gefaltet)`;
    });
    await timed(`${TURN_COUNT} Nachrichten anhängen`, async () => {
      for (let i = 0; i < TURN_COUNT; i++) {
        await episodic.add(i % 2 === 0 ? "user" : "assistant", `Nachricht ${i}`);
      }
      return `${summarizerCalls} Verdichtungsläufe ausgelöst`;
    });
    const context = episodic.getContext();
    assert.ok(context.length <= 41, `Kontext muss beschränkt bleiben, ist aber ${context.length} Nachrichten lang`);
    assert.ok(summarizerCalls > 0 && summarizerCalls < TURN_COUNT / 10, "Verdichtung darf nicht auf jedem Turn feuern");

    console.log("\n4) Beschädigte Datei — Wiederherstellung ohne Absturz");
    const corruptPath = path.join(dir, "corrupt-facts.json");
    await mkdir(dir, { recursive: true });
    await writeFile(corruptPath, "{ this is not json", "utf8");
    const recoveredMemory = new LongTermMemory(corruptPath);
    await timed("beschädigte Fakten-Datei laden und weiterschreiben", async () => {
      const facts = await recoveredMemory.list();
      assert.equal(facts.length, 0, "beschädigte Datei muss auf den Default zurückfallen, nicht crashen");
      await recoveredMemory.remember("test", "funktioniert");
      const again = await recoveredMemory.get("test");
      assert.equal(again?.value, "funktioniert");
    });

    console.log("\n5) Gemischte gleichzeitige Operationen auf denselben Stores");
    const mixedFacts = new LongTermMemory(path.join(dir, "mixed-facts.json"));
    const mixedReminders = new ReminderStore(path.join(dir, "mixed-reminders.json"));
    await timed("500 remember + 500 forget + 500 createTimeReminder gemischt parallel", async () => {
      const ops: Array<Promise<unknown>> = [];
      for (let i = 0; i < 500; i++) {
        ops.push(mixedFacts.remember(`k${i}`, `v${i}`));
        ops.push(mixedFacts.forget(`k${i % 50}`));
        ops.push(mixedReminders.createTimeReminder(`m${i}`, new Date(Date.now() + 1000)));
      }
      await Promise.all(ops);
    });
    const mixedFactsFinal = await mixedFacts.list();
    assert.ok(mixedFactsFinal.length > 0, "gemischte Operationen dürfen den Store nicht leerräumen");
    assert.equal((await mixedReminders.list()).length, 500, "alle 500 gemischt erzeugten Erinnerungen müssen ankommen");

    console.log("\n6) Voller Brain-Durchlauf unter Last (Skills + LLM-Fallback + Gedächtnis)");
    const brainLongTerm = new LongTermMemory(path.join(dir, "brain-facts.json"));
    const brainReminders = new ReminderStore(path.join(dir, "brain-reminders.json"));
    const brain = new Brain(
      fakeLlm("(simulierte Antwort)"),
      new MemoryManager(new EpisodicMemory(15), brainLongTerm, brainReminders),
      new SkillRegistry(),
      "system prompt",
    );
    const BRAIN_TURNS = 500;
    await timed(`${BRAIN_TURNS} Brain.respond()-Aufrufe in Folge`, async () => {
      for (let i = 0; i < BRAIN_TURNS; i++) {
        const reply = await brain.respond(`Testnachricht Nummer ${i}`);
        assert.equal(reply, "(simulierte Antwort)");
      }
    });

    console.log("\nAlle Härtetests bestanden.\n");
    console.log("Zusammenfassung:");
    for (const result of results) {
      console.log(`  - ${result.name}: ${result.ms.toFixed(1)}ms${result.detail ? ` — ${result.detail}` : ""}`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("\nHärtetest fehlgeschlagen:", error);
  process.exitCode = 1;
});

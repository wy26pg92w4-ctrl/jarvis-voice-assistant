# Jarvis Voice Assistant — Gehirn

Kern-Orchestrator ("Gehirn") des Jarvis-Sprachassistenten: nimmt Text-Input
entgegen (aus einer vorgeschalteten Speech-to-Text-Stufe oder direkt per
CLI), entscheidet über Skills oder ein Sprachmodell und liefert eine Antwort
zurück (die dann per Text-to-Speech ausgegeben werden kann).

## Architektur

```
Text-Input → Brain
               ├─ SkillRegistry   (deterministische Befehle, kein LLM-Call)
               │    ├─ time, help
               │    └─ remember/forget/recall/remind (Gedächtnis-Skills)
               ├─ MemoryManager
               │    ├─ EpisodicMemory   (Kurzzeitverlauf + laufende Zusammenfassung)
               │    ├─ LongTermMemory   (dauerhafte Fakten/Präferenzen, JSON-Datei)
               │    └─ ReminderStore    (zeit-/ereignisbasierte Erinnerungen, JSON-Datei)
               └─ OmniRouteClient → OmniRoute-Gateway → 359 LLM-Provider
                                    (Failover, Free-Tiers, Kostenkontrolle)
```

- **Brain** (`src/brain/Brain.ts`) — zentrale Dialoglogik: prüft zuerst, ob
  ein registrierter Skill die Eingabe direkt beantworten kann, sonst baut der
  `MemoryManager` den Kontext (relevante Fakten, fällige Erinnerungen,
  Gesprächsverlauf) und die Anfrage geht ans Sprachmodell.
- **SkillRegistry / Skill** (`src/skills`) — Plugin-Schnittstelle für
  erweiterbare Befehle. Neue Skills implementieren einfach das
  `Skill`-Interface und werden in `src/index.ts` registriert.
- **Gedächtnis** (`src/memory`):
  - `EpisodicMemory` — hält die letzten N Gesprächsrunden; bei Überlauf
    werden ältere Turns batchweise in eine laufende Zusammenfassung gefaltet
    (per LLM-Aufruf, mit netzwerkfreiem Heuristik-Fallback), statt sie
    einfach zu verwerfen.
  - `LongTermMemory` — dauerhafte Fakten/Präferenzen ("mein lieblingsessen
    ist pizza"), persistiert als JSON-Datei, überlebt Neustarts.
  - `ReminderStore` — zeit- und ereignisbasierte Erinnerungen, ebenfalls
    persistiert; `dueReminders()` ist die Abfrage-Oberfläche, die der Brain
    jede Runde prüft, um proaktiv fällige Erinnerungen anzusprechen.
  - `FileStore` (`JsonFileStore`) — gemeinsame, atomare JSON-Persistenz mit
    In-Memory-Cache, Wiederherstellung bei beschädigten Dateien und einer
    `update()`-Methode für echte (nicht nur einzeln serialisierte)
    Read-Modify-Write-Transaktionen.
  - `retrieval` — leichte, netzwerkfreie Relevanzbewertung (Token-Overlap)
    zur Auswahl der für die aktuelle Eingabe relevantesten Fakten.
- **OmniRouteClient** (`src/llm/OmniRouteClient.ts`) — schlanker Client für
  die OpenAI-kompatible `/chat/completions`-Schnittstelle von
  [OmniRoute](https://github.com/diegosouzapw/OmniRoute).

### Warum OmniRoute als LLM-Gateway?

Statt das Gehirn fest an einen einzelnen LLM-Anbieter zu binden, läuft
[OmniRoute](https://github.com/diegosouzapw/OmniRoute) als eigener,
lokaler Dienst und übernimmt Provider-Auswahl, Failover und
Free-Tier-Routing über 359 Anbieter hinweg (150+ davon kostenlos). Der
Jarvis-Brain-Code selbst bleibt dadurch anbieterunabhängig — er spricht
nur die OpenAI-kompatible API von OmniRoute unter `OMNIROUTE_BASE_URL`.

## Setup

1. OmniRoute starten (einmalig konfigurieren, siehe dessen
   [Quick-Start-Guide](https://github.com/diegosouzapw/OmniRoute/blob/main/docs/getting-started/QUICK-START.md)):

   ```bash
   docker compose up -d omniroute
   # Dashboard: http://localhost:20128 — dort einen (ggf. kostenlosen) Provider verbinden
   ```

2. Konfiguration kopieren und API-Key aus dem OmniRoute-Dashboard eintragen:

   ```bash
   cp .env.example .env
   ```

3. Abhängigkeiten installieren und das Gehirn im interaktiven CLI-Modus starten:

   ```bash
   npm install
   npm run dev
   ```

## Tests

```bash
npm test
```

## Härtetest (Gedächtnis unter Last)

`scripts/memory-stress-test.ts` treibt reale, dateibasierte Stores mit
großen Datenmengen und Nebenläufigkeit an (Tausende Fakten/Erinnerungen,
sequentiell und parallel, beschädigte Dateien, gemischte gleichzeitige
Operationen, ein voller `Brain`-Durchlauf über 500 Turns) und meldet Timings:

```bash
npm run stress:memory
```

Ergebnis des letzten Durchlaufs (Sandbox-Umgebung, ~7000 Fakten / ~3000
Erinnerungen insgesamt): keine verlorenen Updates, keine Abstürze bei
beschädigten Dateien, Kontextgröße bleibt trotz 4000 Nachrichten beschränkt.
Sequentielles Speichern von 5000 Fakten dauert ~10s (voller Datei-Rewrite
pro Schreibvorgang — für realistische Alltagsnutzung mit Dutzenden bis
niedrigen Hunderten Fakten unproblematisch, degradiert aber quadratisch bei
sehr großen Stückzahlen am Stück). Ein In-Memory-Cache in `JsonFileStore`
hat das gegenüber der ersten Implementierung bereits um ~55 % beschleunigt;
weitere Beschleunigung (z. B. Write-Batching) wäre nur nötig, falls die
tatsächliche Fakten-/Erinnerungsanzahl deutlich in den vierstelligen Bereich
wächst.

## Nächste Schritte

- Anbindung einer Speech-to-Text/Text-to-Speech-Stufe vor bzw. hinter `Brain.respond()`.
- Echter Scheduler, der `ReminderStore.dueReminders()` auch ohne laufende
  Konversation pollt und den Nutzer proaktiv benachrichtigt (aktuell werden
  fällige Erinnerungen nur beim nächsten Gesprächsturn angesprochen).
- Weitere Skills (Smart-Home, Timer, Web-Suche über OmniRoutes Search-API).

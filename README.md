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
- **Obsidian-Anbindung** (`src/obsidian`, optional) — spiegelt Fakten,
  Erinnerungen und Gesprächs-Zusammenfassungen als verlinkte Markdown-Notizen
  in einen Obsidian-Vault, siehe [unten](#obsidian-anbindung). Implementiert
  als `Synced*`-Wrapper um `LongTermMemory`/`ReminderStore`/`EpisodicMemory`
  (extends, kein Eingriff in die Kernklassen) plus `ObsidianSync`
  (Datei-Export immer, Live-Push über die Local-REST-API optional).

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

### Ein Hermes-Modell (Nous Research) verbinden

Nicht zu verwechseln mit dem separaten "Hermes Agent"-CLI-Tool (ein
eigenständiger autonomer Terminal-Agent von Nous Research) — hier geht es
um das *Hermes-Sprachmodell* als Antwort-Engine für Jarvis. Da Jarvis nie
direkt mit einem Anbieter spricht, sondern immer über OmniRoute, braucht
das **keine Code-Änderung**, nur Konfiguration:

1. Im OmniRoute-Dashboard (`http://localhost:20128`) unter **Providers**
   den Provider **Nous Research** hinzufügen und einen API-Key von
   [portal.nousresearch.com](https://portal.nousresearch.com) eintragen
   (kostenloser Tier: 50 RPM / 500.000 TPM, keine Kreditkarte nötig).
2. Verfügbare Hermes-Modell-IDs für die eigene OmniRoute-Instanz prüfen:

   ```bash
   curl http://localhost:20128/v1/models \
     -H "Authorization: Bearer $OMNIROUTE_API_KEY" | grep -i hermes
   ```

3. In `.env` das gewünschte Modell eintragen, z. B.:

   ```bash
   JARVIS_MODEL=Hermes-4-70B
   ```

Jarvis holt sich Antworten ab sofort über OmniRoute vom Hermes-Modell statt
vom bisherigen (per `auto` gewählten) Modell — Brain, Skills und Gedächtnis
bleiben unverändert, da sie ausschließlich gegen die OpenAI-kompatible
Schnittstelle von OmniRoute sprechen.

## Obsidian-Anbindung

Fakten, Erinnerungen und Gesprächs-Zusammenfassungen lassen sich als
verlinkte Markdown-Notizen in einen Obsidian-Vault spiegeln. Aktivierung
über eine einzige Variable in `.env`:

```bash
JARVIS_OBSIDIAN_VAULT_PATH=/pfad/zu/deinem/Obsidian-Vault
```

Das genügt bereits vollständig — Obsidian muss dafür nicht laufen, es liest
beim nächsten Öffnen einfach die Dateien vom Datenträger:

- `Jarvis/Fakten/<fakt>.md` — eine Notiz pro gespeichertem Fakt
- `Jarvis/Erinnerungen/<erinnerung>.md` — eine Notiz pro Erinnerung, mit
  Checkbox (`- [ ]` / `- [x]` nach Auslösen)
- `Jarvis/Journal/<YYYY-MM-DD>.md` — tägliche Gesprächs-Zusammenfassungen
  (angehängt, sobald `EpisodicMemory` eine neue Zusammenfassung erzeugt)
- `Jarvis/Jarvis Gedächtnis.md` — automatisch gepflegte Übersichtsnotiz
  (MOC), die alle Fakten und Erinnerungen per `[[Wikilink]]` verlinkt; jede
  Fakt-/Erinnerungsnotiz verlinkt umgekehrt auf diese Übersicht zurück

**Rückrichtung (Vault → Jarvis):** Von Hand angelegte oder bearbeitete
Fakten-Notizen im `Jarvis/Fakten/`-Ordner werden beim Start automatisch
eingelesen, und jederzeit erneut per Skill:

```
importiere aus obsidian
```

**Optional: Live-Sync über die "Local REST API"-Plugin** — falls Änderungen
sofort in einer bereits geöffneten Obsidian-App sichtbar sein sollen, ohne
dass sie die Datei neu einliest:

1. In Obsidian das Community-Plugin **Local REST API**
   ([obsidian-local-rest-api](https://github.com/coddingtonbear/obsidian-local-rest-api))
   installieren und aktivieren; einen API-Key generieren.
2. In `.env`:

   ```bash
   JARVIS_OBSIDIAN_REST_URL=http://127.0.0.1:27123   # Klartext-Port des Plugins, kein Zertifikatsproblem
   JARVIS_OBSIDIAN_REST_API_KEY=<Key aus dem Plugin>
   ```

Die Vault-Dateien bleiben in jedem Fall die Wahrheitsquelle; ein
unerreichbares oder falsch konfiguriertes REST-Backend lässt den Push
einfach fehlschlagen (geloggt, nicht geworfen) — Jarvis' Kernfunktionen
sind davon nie betroffen.

### Wartungs-Skripte für einen bestehenden Vault

Zwei eigenständige Skripte, die du **lokal gegen deinen echten Vault**
ausführst (diese Session hat keinen Zugriff auf dein Dateisystem — sie
laufen bei dir, nicht hier). Beide sind standardmäßig Dry-Run und legen vor
jeder Änderung ein Backup an:

```bash
# Frontmatter (title/tags/type/created/updated/status) prüfen und ergänzen
npx tsx scripts/obsidian-frontmatter-audit.ts --vault /pfad/zum/vault
npx tsx scripts/obsidian-frontmatter-audit.ts --vault /pfad/zum/vault --write

# 3 geplante QuickAdd-Flows ("Neue Notiz", "Neue MOC", "Schneller Gedanke")
# in eine bestehende QuickAdd-Konfiguration mergen (nicht überschreiben)
npx tsx scripts/obsidian-quickadd-setup.ts --vault /pfad/zum/vault
npx tsx scripts/obsidian-quickadd-setup.ts --vault /pfad/zum/vault --write
```

Frontmatter-Audit: `type` wird aus dem Top-Level-Ordner abgeleitet
(`10-notizen`→`notiz`, `20-mocs`→`moc`, `00-inbox`→`inbox`, sonst `notiz`),
fehlender `status` wird auf `draft` gesetzt, `vorlagen/`/`templates/`/
`.obsidian/` werden nie angefasst. Bestehende Werte werden nie überschrieben
— nur wirklich fehlende Felder werden ergänzt.

QuickAdd-Setup: setzt voraus, dass das Plugin in Obsidian mindestens einmal
aktiviert wurde (sonst existiert `data.json` noch nicht); ergänzt fehlende
Flows anhand des Namens, lässt alles andere in der Datei unangetastet.
Nach dem Schreiben Obsidian neu laden, damit QuickAdd die neuen Flows zeigt.

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

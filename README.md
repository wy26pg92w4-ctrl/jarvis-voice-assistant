# Jarvis Voice Assistant — Gehirn

Kern-Orchestrator ("Gehirn") des Jarvis-Sprachassistenten: nimmt Text-Input
entgegen (aus einer vorgeschalteten Speech-to-Text-Stufe oder direkt per
CLI), entscheidet über Skills oder ein Sprachmodell und liefert eine Antwort
zurück (die dann per Text-to-Speech ausgegeben werden kann).

## Architektur

```
Text-Input → Brain
               ├─ SkillRegistry  (deterministische Befehle, kein LLM-Call)
               └─ OmniRouteClient → OmniRoute-Gateway → 359 LLM-Provider
                                    (Failover, Free-Tiers, Kostenkontrolle)
```

- **Brain** (`src/brain/Brain.ts`) — zentrale Dialoglogik: prüft zuerst, ob
  ein registrierter Skill die Eingabe direkt beantworten kann, sonst geht die
  Anfrage inkl. Konversationsverlauf an das Sprachmodell.
- **SkillRegistry / Skill** (`src/skills`) — Plugin-Schnittstelle für
  erweiterbare Befehle (z. B. Uhrzeit, Hilfe). Neue Skills implementieren
  einfach das `Skill`-Interface und werden in `src/index.ts` registriert.
- **ConversationMemory** (`src/memory`) — hält die letzten N
  Gesprächsrunden im Prozessspeicher als Kontext für das Sprachmodell.
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

## Nächste Schritte

- Anbindung einer Speech-to-Text/Text-to-Speech-Stufe vor bzw. hinter `Brain.respond()`.
- Persistente Langzeit-Erinnerung (aktuell nur In-Memory pro Prozess).
- Weitere Skills (Smart-Home, Timer, Web-Suche über OmniRoutes Search-API).

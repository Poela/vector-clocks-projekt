# Vector Clocks & Kausalität – PoC

Dieser Proof of Concept demonstriert zentrale Konzepte verteilter Systeme:

- Lamport Clocks
- Vector Clocks
- Kausale Ordnung vs. totale Ordnung
- Dynamo-inspirierte Versionierung und Konflikterkennung

## Start

Einfach `index.html` im Browser öffnen.

## Funktionen

- Lokale Events auf einzelnen Nodes
- Nachrichtenversand zwischen Nodes
- Zustellung von Nachrichten über eine Warteschlange
- Anzeige von Lamport- und Vector-Timestamps
- Vergleich zweier Events
- Vereinfachtes Dynamo-Szenario mit konkurrierenden Versionen

## Ziel

Der PoC zeigt:

- Lamport Clocks erzeugen eine logische Ordnung, können aber konkurrierende Events nicht sicher erkennen
- Vector Clocks können kausale Beziehungen und Konkurrenz modellieren
- Dynamo-artige Versionsverwaltung kann konkurrierende Writes sichtbar machen

## Vereinfachungen

Dieser PoC ist bewusst vereinfacht und implementiert nicht:

- echte Netzwerkkommunikation
- persistente Speicherung
- Quorum Reads/Writes
- Membership Changes
- Failure Detection
- vollständige Dynamo-Mechanismen wie Hinted Handoff oder Merkle Trees

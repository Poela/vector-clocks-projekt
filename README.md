# Vector Clocks & Kausalität – PoC

Interaktive Web-Simulation für:

- Lamport Clocks
- Vector Clocks
- Kausale Ordnung vs. totale Ordnung
- Dynamo-inspirierte Konflikterkennung mit Siblings

## Start in IntelliJ

1. Ordner in IntelliJ öffnen
2. Datei `index.html` öffnen
3. Im Browser starten

Falls IntelliJ keinen direkten Browser-Start anbietet:
- `index.html` per Doppelklick im Browser öffnen

## Features

- Mehrere Nodes
- Lokale Events
- Nachrichtenversand zwischen Nodes
- Canvas-Netzwerkvisualisierung
- Lamport- und Vector-Clocks pro Node
- Event-Vergleich: happened-before vs. concurrent
- Dynamo-Konflikt-Szenario
- Anzeige konkurrierender Sibling-Versionen

## Gute Demo-Szenarien

### 1. Concurrent Events
- Button `Concurrent-Szenario`
- Zwei Nodes erzeugen lokale Events ohne Kommunikation
- Vector Clocks zeigen: concurrent

### 2. Nachrichtenaustausch
- Nachricht senden
- Danach zustellen
- Receiver übernimmt kausale Information

### 3. Dynamo-Konflikt
- Button `Dynamo-Konflikt`
- Zwei unabhängige Writes auf verschiedenen Nodes
- Beide Versionen bleiben als Siblings erhalten

## Vereinfachungen

Der PoC simuliert Konzepte und ist kein vollständiges verteiltes Datenbanksystem.

Nicht enthalten:
- echter Netzwerkstack
- Persistenz
- Quorum Reads/Writes
- Membership Changes
- Failure Detection
- vollständige Dynamo-Features wie Hinted Handoff oder Merkle Trees

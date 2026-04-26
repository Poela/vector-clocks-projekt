class EventRecord {
  constructor(id, type, nodeId, lamport, vector, details = {}) {
    this.id = id;
    this.type = type;
    this.nodeId = nodeId;
    this.lamport = lamport;
    this.vector = [...vector];
    this.details = details;
  }
}

class Message {
  constructor(id, from, to, payload, lamport, vector) {
    this.id = id;
    this.from = from;
    this.to = to;
    this.payload = payload;
    this.lamport = lamport;
    this.vector = [...vector];
  }
}

class NodeState {
  constructor(id, totalNodes) {
    this.id = id;
    this.lamport = 0;
    this.vector = new Array(totalNodes).fill(0);
    this.log = [];
    this.versions = [];
    this.position = { x: 0, y: 0 };
  }
}

let nodes = [];
let networkQueue = [];
let globalEventLog = [];
let nextEventId = 1;
let nextMessageId = 1;

const nodeCountSelect = document.getElementById("nodeCount");
const localNodeSelect = document.getElementById("localNode");
const sendFromSelect = document.getElementById("sendFrom");
const sendToSelect = document.getElementById("sendTo");
const payloadInput = document.getElementById("payloadInput");
const compareASelect = document.getElementById("compareA");
const compareBSelect = document.getElementById("compareB");
const dynamoNodeSelect = document.getElementById("dynamoNode");
const dynamoValueInput = document.getElementById("dynamoValue");

const nodesContainer = document.getElementById("nodesContainer");
const eventLogDiv = document.getElementById("eventLog");
const compareResultDiv = document.getElementById("compareResult");
const dynamoViewDiv = document.getElementById("dynamoView");
const dynamoSummaryDiv = document.getElementById("dynamoSummary");
const queueInfoDiv = document.getElementById("queueInfo");

const canvas = document.getElementById("networkCanvas");
const ctx = canvas.getContext("2d");

document.getElementById("initBtn").addEventListener("click", initialize);
document.getElementById("localEventBtn").addEventListener("click", handleLocalEvent);
document.getElementById("sendBtn").addEventListener("click", handleSendMessage);
document.getElementById("deliverNextBtn").addEventListener("click", deliverNextMessage);
document.getElementById("randomScenarioBtn").addEventListener("click", randomScenario);
document.getElementById("compareBtn").addEventListener("click", compareSelectedEvents);
document.getElementById("resetBtn").addEventListener("click", initialize);
document.getElementById("dynamoWriteBtn").addEventListener("click", handleDynamoWrite);
document.getElementById("dynamoSyncBtn").addEventListener("click", handleDynamoSync);
document.getElementById("partitionScenarioBtn").addEventListener("click", runDynamoConflictScenario);
document.getElementById("scenarioConcurrencyBtn").addEventListener("click", runConcurrentEventsScenario);
window.addEventListener("resize", renderCanvas);

function initialize() {
  const nodeCount = parseInt(nodeCountSelect.value, 10);
  nodes = [];
  networkQueue = [];
  globalEventLog = [];
  nextEventId = 1;
  nextMessageId = 1;
  compareResultDiv.innerHTML = "";
  dynamoSummaryDiv.innerHTML = explanationBanner(
    "Dynamo-Versionierung",
    "Mehrere konkurrierende Writes bleiben als Siblings erhalten, wenn ihre Vector Clocks nicht vergleichbar sind."
  );

  for (let i = 0; i < nodeCount; i++) {
    nodes.push(new NodeState(i, nodeCount));
  }

  computeNodePositions();
  fillNodeSelectors();
  renderAll();
}

function fillNodeSelectors() {
  const selectors = [localNodeSelect, sendFromSelect, sendToSelect, dynamoNodeSelect];
  selectors.forEach(select => {
    select.innerHTML = "";
    nodes.forEach(node => {
      const option = document.createElement("option");
      option.value = node.id;
      option.textContent = `Node ${node.id}`;
      select.appendChild(option);
    });
  });

  if (nodes.length > 1) {
    sendToSelect.selectedIndex = 1;
  }

  renderCompareSelectors();
}

function renderCompareSelectors() {
  compareASelect.innerHTML = "";
  compareBSelect.innerHTML = "";

  globalEventLog.forEach(event => {
    const label = `#${event.id} | N${event.nodeId} | ${event.type} | L=${event.lamport} | V=[${event.vector.join(",")}]`;

    const optA = document.createElement("option");
    optA.value = event.id;
    optA.textContent = label;
    compareASelect.appendChild(optA);

    const optB = document.createElement("option");
    optB.value = event.id;
    optB.textContent = label;
    compareBSelect.appendChild(optB);
  });

  if (compareBSelect.options.length > 1) {
    compareBSelect.selectedIndex = 1;
  }
}

function computeNodePositions() {
  const width = canvas.width;
  const height = canvas.height;
  const cx = width / 2;
  const cy = height / 2 + 8;
  const radius = Math.min(width, height) * 0.33;

  nodes.forEach((node, index) => {
    const angle = (2 * Math.PI * index) / nodes.length - Math.PI / 2;
    node.position = {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle)
    };
  });
}

function logEvent(node, type, details = {}) {
  const event = new EventRecord(
    nextEventId++,
    type,
    node.id,
    node.lamport,
    node.vector,
    details
  );
  node.log.push(event);
  globalEventLog.push(event);
  renderCompareSelectors();
}

function doLocalEvent(node, type = "local") {
  node.lamport += 1;
  node.vector[node.id] += 1;
  logEvent(node, type);
}

function handleLocalEvent() {
  const node = nodes[parseInt(localNodeSelect.value, 10)];
  doLocalEvent(node, "local");
  renderAll();
}

function handleSendMessage() {
  const from = nodes[parseInt(sendFromSelect.value, 10)];
  const to = nodes[parseInt(sendToSelect.value, 10)];

  if (from.id === to.id) {
    alert("Sender und Empfänger müssen verschieden sein.");
    return;
  }

  from.lamport += 1;
  from.vector[from.id] += 1;

  const payload = payloadInput.value || "hello";
  const msg = new Message(
    nextMessageId++,
    from.id,
    to.id,
    payload,
    from.lamport,
    from.vector
  );

  networkQueue.push(msg);
  logEvent(from, "send", { to: to.id, payload });
  renderAll();
}

function deliverNextMessage() {
  if (networkQueue.length === 0) {
    alert("Keine Nachricht im Netzwerk.");
    return;
  }

  const msg = networkQueue.shift();
  const to = nodes[msg.to];

  to.lamport = Math.max(to.lamport, msg.lamport) + 1;

  for (let i = 0; i < to.vector.length; i++) {
    to.vector[i] = Math.max(to.vector[i], msg.vector[i]);
  }
  to.vector[to.id] += 1;

  logEvent(to, "receive", { from: msg.from, payload: msg.payload });
  renderAll();
}

function compareVectors(a, b) {
  let aLessOrEqual = true;
  let bLessOrEqual = true;
  let aStrict = false;
  let bStrict = false;

  for (let i = 0; i < a.length; i++) {
    if (a[i] > b[i]) aLessOrEqual = false;
    if (b[i] > a[i]) bLessOrEqual = false;
    if (a[i] < b[i]) aStrict = true;
    if (b[i] < a[i]) bStrict = true;
  }

  if (aLessOrEqual && aStrict) return "before";
  if (bLessOrEqual && bStrict) return "after";
  return "concurrent";
}

function compareSelectedEvents() {
  const idA = parseInt(compareASelect.value, 10);
  const idB = parseInt(compareBSelect.value, 10);

  const a = globalEventLog.find(e => e.id === idA);
  const b = globalEventLog.find(e => e.id === idB);

  if (!a || !b) {
    compareResultDiv.innerHTML = explanationBanner("Fehlende Auswahl", "Bitte zwei Events auswählen.");
    return;
  }

  const relation = compareVectors(a.vector, b.vector);

  let lamportText;
  if (a.lamport < b.lamport) {
    lamportText = "Lamport ordnet A vor B.";
  } else if (a.lamport > b.lamport) {
    lamportText = "Lamport ordnet B vor A.";
  } else {
    lamportText = "Lamport sieht identische Zählerstände.";
  }

  let relationText = "";
  let relationClass = "";

  if (relation === "before") {
    relationText = "A happened-before B";
    relationClass = "state-before";
  } else if (relation === "after") {
    relationText = "B happened-before A";
    relationClass = "state-after";
  } else {
    relationText = "A und B sind concurrent";
    relationClass = "state-concurrent";
  }

  compareResultDiv.innerHTML = `
    <div class="compare-insight">
      <div class="compare-state ${relationClass}">${relationText}</div>
      <div class="small" style="margin-top:6px;">${lamportText}</div>
    </div>

    <div class="log-item">
      <strong>Event A</strong><br/>
      #${a.id} · Node ${a.nodeId} · ${a.type}<br/>
      <span class="small">Lamport=${a.lamport} · Vector=[${a.vector.join(",")}]</span>
    </div>

    <div class="log-item">
      <strong>Event B</strong><br/>
      #${b.id} · Node ${b.nodeId} · ${b.type}<br/>
      <span class="small">Lamport=${b.lamport} · Vector=[${b.vector.join(",")}]</span>
    </div>

    <div class="log-item">
      <strong>Interpretation</strong><br/>
      Lamport Clocks liefern eine logische Ordnung, aber keine sichere Erkennung von Konkurrenz.
      Vector Clocks erlauben die Unterscheidung zwischen <code>happened-before</code> und <code>concurrent</code>.
    </div>
  `;
}

function randomScenario() {
  const action = Math.floor(Math.random() * 3);

  if (action === 0) {
    const node = nodes[Math.floor(Math.random() * nodes.length)];
    doLocalEvent(node, "local-random");
  } else if (action === 1 && nodes.length > 1) {
    let fromIndex = Math.floor(Math.random() * nodes.length);
    let toIndex = Math.floor(Math.random() * nodes.length);
    while (toIndex === fromIndex) toIndex = Math.floor(Math.random() * nodes.length);

    const from = nodes[fromIndex];
    const to = nodes[toIndex];

    from.lamport += 1;
    from.vector[from.id] += 1;

    const msg = new Message(
      nextMessageId++,
      from.id,
      to.id,
      "random-msg",
      from.lamport,
      from.vector
    );

    networkQueue.push(msg);
    logEvent(from, "send-random", { to: to.id, payload: "random-msg" });
  } else if (networkQueue.length > 0) {
    deliverNextMessage();
    return;
  }

  renderAll();
}

function runConcurrentEventsScenario() {
  initialize();
  if (nodes.length < 2) return;

  doLocalEvent(nodes[0], "scenario-local");
  doLocalEvent(nodes[1], "scenario-local");

  compareResultDiv.innerHTML = explanationBanner(
    "Concurrent Events",
    "Node 0 und Node 1 erzeugen jeweils ein lokales Event ohne Nachrichtenaustausch. Vector Clocks erkennen diese Events als concurrent."
  );

  renderAll();
}

function handleDynamoWrite() {
  const node = nodes[parseInt(dynamoNodeSelect.value, 10)];
  const value = dynamoValueInput.value.trim();

  if (!value) {
    alert("Bitte einen Wert eingeben.");
    return;
  }

  node.lamport += 1;
  node.vector[node.id] += 1;
  logEvent(node, "dynamo-write", { value });

  const newVersion = {
    value,
    vector: [...node.vector],
    nodeId: node.id
  };

  node.versions = reconcileVersions(node.versions, newVersion);
  renderAll();
}

function reconcileVersions(existingVersions, newVersion) {
  const survivors = [];
  let dominated = false;

  for (const version of existingVersions) {
    const relation = compareVectors(version.vector, newVersion.vector);

    if (relation === "before") {
      continue;
    } else if (relation === "after") {
      dominated = true;
      survivors.push(version);
    } else {
      survivors.push(version);
    }
  }

  if (!dominated) {
    survivors.push(newVersion);
  }

  return survivors;
}

function handleDynamoSync() {
  let merged = [];

  for (const node of nodes) {
    for (const version of node.versions) {
      merged = reconcileVersions(merged, version);
    }
  }

  for (const node of nodes) {
    node.versions = JSON.parse(JSON.stringify(merged));
  }

  dynamoSummaryDiv.innerHTML = explanationBanner(
    "Synchronisation abgeschlossen",
    merged.length > 1
      ? `Es existieren weiterhin ${merged.length} konkurrierende Sibling-Versionen.`
      : "Alle Nodes sehen jetzt dieselbe dominante Version."
  );

  renderAll();
}

function runDynamoConflictScenario() {
  initialize();
  if (nodes.length < 2) return;

  const a = nodes[0];
  const b = nodes[1];

  a.lamport += 1;
  a.vector[a.id] += 1;
  logEvent(a, "dynamo-write", { value: "rot" });
  a.versions = reconcileVersions(a.versions, {
    value: "rot",
    vector: [...a.vector],
    nodeId: a.id
  });

  b.lamport += 1;
  b.vector[b.id] += 1;
  logEvent(b, "dynamo-write", { value: "blau" });
  b.versions = reconcileVersions(b.versions, {
    value: "blau",
    vector: [...b.vector],
    nodeId: b.id
  });

  dynamoSummaryDiv.innerHTML = explanationBanner(
    "Dynamo-Konflikt",
    "Zwei Writes entstehen unabhängig voneinander. Da ihre Vector Clocks nicht vergleichbar sind, bleiben beide Versionen als concurrent siblings erhalten."
  );

  renderAll();
}

function explanationBanner(title, text) {
  return `
    <div>
      <strong>${title}</strong><br/>
      <span class="small">${text}</span>
    </div>
  `;
}

function renderNodes() {
  nodesContainer.innerHTML = "";

  nodes.forEach(node => {
    const card = document.createElement("div");
    card.className = "node-card";

    const versionsHtml = node.versions.length === 0
      ? `<div class="small">Keine gespeicherten Versionen.</div>`
      : `<div class="version-group">${
          node.versions.map(v => {
            const colorClass = node.versions.length > 1 ? "red" : "green";
            return `
              <div class="version-card ${colorClass}">
                <div class="title">Wert: <code>${escapeHtml(v.value)}</code></div>
                <div class="small">Vector=[${v.vector.join(",")}]</div>
                <div class="small">erstellt von Node ${v.nodeId}</div>
              </div>
            `;
          }).join("")
        }</div>`;

    const logHtml = node.log.length === 0
      ? `<div class="small">Noch keine Events.</div>`
      : [...node.log].reverse().map(event => `
          <div class="log-item">
            <strong>#${event.id}</strong> ${escapeHtml(event.type)}<br/>
            <span class="small">Lamport=${event.lamport} · Vector=[${event.vector.join(",")}]</span>
          </div>
        `).join("");

    card.innerHTML = `
      <div class="node-head">
        <div class="node-name">Node ${node.id}</div>
        <div class="node-chip">aktive Replica</div>
      </div>

      <div class="stat-grid">
        <div class="stat">
          <div class="k">Lamport Clock</div>
          <div class="v">${node.lamport}</div>
        </div>
        <div class="stat">
          <div class="k">Vector Clock</div>
          <div class="v">[${node.vector.join(", ")}]</div>
        </div>
      </div>

      <div class="subhead">Dynamo-Versionen</div>
      ${versionsHtml}

      <div class="subhead">Node-Log</div>
      <div class="node-log">${logHtml}</div>
    `;

    nodesContainer.appendChild(card);
  });
}

function renderGlobalLog() {
  if (globalEventLog.length === 0) {
    eventLogDiv.innerHTML = `<div class="log-item"><span class="small">Noch keine Events vorhanden.</span></div>`;
    return;
  }

  eventLogDiv.innerHTML = [...globalEventLog].reverse().map(event => `
    <div class="log-item">
      <strong>#${event.id}</strong> Node ${event.nodeId} · ${escapeHtml(event.type)}<br/>
      <span class="small">Lamport=${event.lamport} · Vector=[${event.vector.join(",")}]</span>
    </div>
  `).join("");
}

function renderDynamoView() {
  const totalVersions = nodes.reduce((sum, node) => sum + node.versions.length, 0);
  const anyConflicts = nodes.some(node => node.versions.length > 1);

  if (nodes.every(node => node.versions.length === 0)) {
    dynamoViewDiv.innerHTML = `
      <div class="version-card green">
        <div class="title">Noch keine Objektversionen</div>
        <div class="small">Führe Writes aus oder starte das Dynamo-Konflikt-Szenario.</div>
      </div>
    `;
    return;
  }

  if (!dynamoSummaryDiv.innerHTML.trim()) {
    dynamoSummaryDiv.innerHTML = explanationBanner(
      "Aktueller Zustand",
      anyConflicts
        ? "Mindestens ein Node enthält mehrere Sibling-Versionen."
        : "Der Zustand ist aktuell konfliktfrei."
    );
  }

  dynamoViewDiv.innerHTML = nodes.map(node => {
    const hasConflict = node.versions.length > 1;
    return `
      <div class="node-card">
        <div class="node-head">
          <div class="node-name">Node ${node.id}</div>
          <div class="node-chip">${hasConflict ? "siblings" : "single version"}</div>
        </div>
        <div class="small" style="margin-bottom:10px;">
          ${hasConflict
            ? "Mehrere konkurrierende Versionen vorhanden."
            : "Keine Konkurrenz zwischen Versionen auf diesem Node."}
        </div>
        <div class="version-group">
          ${node.versions.map(v => `
            <div class="version-card ${hasConflict ? "red" : "green"}">
              <div class="title">Value: <code>${escapeHtml(v.value)}</code></div>
              <div class="small">Vector=[${v.vector.join(",")}]</div>
              <div class="small">Origin Node ${v.nodeId}</div>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }).join("");

  const suffix = anyConflicts ? "Es bestehen Konflikte zwischen Versionen." : "Keine sichtbaren Konflikte.";
  dynamoSummaryDiv.innerHTML = explanationBanner(
    "Dynamo-Überblick",
    `${totalVersions} gespeicherte Versionen über alle Nodes hinweg. ${suffix}`
  );
}

function renderQueueInfo() {
  if (networkQueue.length === 0) {
    queueInfoDiv.innerHTML = `
      <div class="queue-item">
        <strong>Netzwerk-Queue leer</strong><br/>
        <span class="small">Sende eine Nachricht oder starte ein Szenario.</span>
      </div>
    `;
    return;
  }

  queueInfoDiv.innerHTML = networkQueue.map(msg => `
    <div class="queue-item">
      <strong>Msg #${msg.id}</strong> von Node ${msg.from} an Node ${msg.to}<br/>
      Payload: <code>${escapeHtml(msg.payload)}</code><br/>
      <span class="small">Lamport=${msg.lamport} · Vector=[${msg.vector.join(",")}]</span>
    </div>
  `).join("");
}

function renderCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = Math.max(700, Math.floor(rect.width || 1100));
  const cssHeight = 460;

  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;
  canvas.style.height = cssHeight + "px";

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  computeNodePositions();

  ctx.clearRect(0, 0, cssWidth, cssHeight);

  drawBackgroundGrid(cssWidth, cssHeight);
  drawConnections();
  drawQueuedMessages();
  drawNodes();
}

function drawBackgroundGrid(width, height) {
  ctx.save();
  ctx.strokeStyle = "rgba(148,163,184,0.08)";
  ctx.lineWidth = 1;

  for (let x = 0; x < width; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  for (let y = 0; y < height; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawConnections() {
  ctx.save();
  ctx.strokeStyle = "rgba(59,130,246,0.18)";
  ctx.lineWidth = 1.5;

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      ctx.beginPath();
      ctx.moveTo(nodes[i].position.x, nodes[i].position.y);
      ctx.lineTo(nodes[j].position.x, nodes[j].position.y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawNodes() {
  nodes.forEach(node => {
    const { x, y } = node.position;

    ctx.save();

    ctx.beginPath();
    ctx.arc(x, y, 38, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(30,64,175,0.35)";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, 32, 0, Math.PI * 2);
    ctx.fillStyle = "#2563eb";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x - 8, y - 8, 10, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 16px Arial";
    ctx.textAlign = "center";
    ctx.fillText(`N${node.id}`, x, y + 5);

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "13px Arial";
    ctx.fillText(`L=${node.lamport}`, x, y + 58);
    ctx.fillText(`[${node.vector.join(",")}]`, x, y + 76);

    ctx.restore();
  });
}

function drawQueuedMessages() {
  networkQueue.forEach((msg, index) => {
    const from = nodes[msg.from].position;
    const to = nodes[msg.to].position;

    const t = 0.25 + (index * 0.18 % 0.5);
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;

    drawArrow(from.x, from.y, to.x, to.y, "rgba(245,158,11,0.9)");

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.fillStyle = "#f59e0b";
    ctx.fill();

    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 11px Arial";
    ctx.textAlign = "center";
    ctx.fillText(String(msg.id), x, y + 4);
    ctx.restore();
  });
}

function drawArrow(x1, y1, x2, y2, color) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const angle = Math.atan2(dy, dx);
  const nodeOffset = 36;

  const startX = x1 + Math.cos(angle) * nodeOffset;
  const startY = y1 + Math.sin(angle) * nodeOffset;
  const endX = x2 - Math.cos(angle) * nodeOffset;
  const endY = y2 - Math.sin(angle) * nodeOffset;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;

  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.stroke();

  const arrowSize = 10;
  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(
    endX - arrowSize * Math.cos(angle - Math.PI / 6),
    endY - arrowSize * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    endX - arrowSize * Math.cos(angle + Math.PI / 6),
    endY - arrowSize * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderAll() {
  renderNodes();
  renderGlobalLog();
  renderDynamoView();
  renderQueueInfo();
  renderCompareSelectors();
  renderCanvas();
}

initialize();

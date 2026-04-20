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
    this.versions = []; // Dynamo-artige Objektversionen
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
const networkQueueDiv = document.getElementById("networkQueue");
const eventLogDiv = document.getElementById("eventLog");
const compareResultDiv = document.getElementById("compareResult");
const dynamoViewDiv = document.getElementById("dynamoView");

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

function initialize() {
  const nodeCount = parseInt(nodeCountSelect.value, 10);
  nodes = [];
  networkQueue = [];
  globalEventLog = [];
  nextEventId = 1;
  nextMessageId = 1;

  for (let i = 0; i < nodeCount; i++) {
    nodes.push(new NodeState(i, nodeCount));
  }

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

  sendToSelect.selectedIndex = nodes.length > 1 ? 1 : 0;
  renderCompareSelectors();
}

function renderCompareSelectors() {
  compareASelect.innerHTML = "";
  compareBSelect.innerHTML = "";

  globalEventLog.forEach(event => {
    const label = `#${event.id} | Node ${event.nodeId} | ${event.type} | L=${event.lamport} | V=[${event.vector.join(",")}]`;

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

function handleLocalEvent() {
  const node = nodes[parseInt(localNodeSelect.value, 10)];
  node.lamport += 1;
  node.vector[node.id] += 1;
  logEvent(node, "local");
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
    compareResultDiv.textContent = "Bitte zwei Events auswählen.";
    return;
  }

  const vectorRelation = compareVectors(a.vector, b.vector);

  let lamportInterpretation = "";
  if (a.lamport < b.lamport) {
    lamportInterpretation = "Lamport: A liegt vor B.";
  } else if (a.lamport > b.lamport) {
    lamportInterpretation = "Lamport: B liegt vor A.";
  } else {
    lamportInterpretation = "Lamport: gleiche Zeitstempel.";
  }

  let vectorInterpretation = "";
  if (vectorRelation === "before") {
    vectorInterpretation = "Vector Clocks: A happened-before B.";
  } else if (vectorRelation === "after") {
    vectorInterpretation = "Vector Clocks: B happened-before A.";
  } else {
    vectorInterpretation = "Vector Clocks: A und B sind concurrent.";
  }

  compareResultDiv.innerHTML = `
    <div class="log-item">
      <strong>Event A:</strong> #${a.id}, Node ${a.nodeId}, ${a.type}, L=${a.lamport}, V=[${a.vector.join(",")}]
    </div>
    <div class="log-item">
      <strong>Event B:</strong> #${b.id}, Node ${b.nodeId}, ${b.type}, L=${b.lamport}, V=[${b.vector.join(",")}]
    </div>
    <div class="log-item">
      <strong>${lamportInterpretation}</strong><br/>
      <strong>${vectorInterpretation}</strong><br/>
      <span class="small">
        Wichtig: Lamport erzeugt eine logische Ordnung, erkennt aber keine echte Konkurrenz.
        Vector Clocks können konkurrierende Events explizit sichtbar machen.
      </span>
    </div>
  `;
}

function randomScenario() {
  const action = Math.floor(Math.random() * 3);

  if (action === 0) {
    const node = nodes[Math.floor(Math.random() * nodes.length)];
    node.lamport += 1;
    node.vector[node.id] += 1;
    logEvent(node, "local-random");
  } else if (action === 1 && nodes.length > 1) {
    let fromIndex = Math.floor(Math.random() * nodes.length);
    let toIndex = Math.floor(Math.random() * nodes.length);
    while (toIndex === fromIndex) {
      toIndex = Math.floor(Math.random() * nodes.length);
    }
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

  renderAll();
}

function runDynamoConflictScenario() {
  if (nodes.length < 2) {
    alert("Für das Konflikt-Szenario werden mindestens 2 Nodes benötigt.");
    return;
  }

  initialize();

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

  renderAll();

  compareResultDiv.innerHTML = `
    <div class="log-item concurrent">
      <strong>Dynamo-Konflikt-Szenario erzeugt:</strong><br/>
      Node 0 schreibt <code>rot</code>, Node 1 schreibt <code>blau</code> ohne gegenseitige Kenntnis.<br/>
      Diese Versionen sind concurrent und bleiben daher zunächst als konkurrierende Versionen bestehen.
    </div>
  `;
}

function renderNodes() {
  nodesContainer.innerHTML = "";

  nodes.forEach(node => {
    const card = document.createElement("div");
    card.className = "node-card";

    const versionsHtml = node.versions.length === 0
      ? "<div class='small'>Keine Versionen gespeichert.</div>"
      : node.versions.map(v => `
          <div class="version-item">
            <strong>Wert:</strong> ${v.value}<br/>
            <span class="small">Vector=[${v.vector.join(",")}] | Node ${v.nodeId}</span>
          </div>
        `).join("");

    const logHtml = node.log.length === 0
      ? "<div class='small'>Noch keine Events.</div>"
      : [...node.log].reverse().map(event => `
          <div class="log-item">
            <strong>#${event.id}</strong> ${event.type}<br/>
            <span class="small">L=${event.lamport} | V=[${event.vector.join(",")}]</span>
          </div>
        `).join("");

    card.innerHTML = `
      <h3>Node ${node.id}</h3>
      <div class="node-state"><strong>Lamport:</strong> ${node.lamport}</div>
      <div class="node-state"><strong>Vector:</strong> [${node.vector.join(", ")}]</div>
      <div class="node-state"><strong>Versionen:</strong></div>
      ${versionsHtml}
      <div class="node-state"><strong>Node-Log:</strong></div>
      <div class="node-log">${logHtml}</div>
    `;

    nodesContainer.appendChild(card);
  });
}

function renderQueue() {
  if (networkQueue.length === 0) {
    networkQueueDiv.innerHTML = "<div class='small'>Keine Nachrichten in der Warteschlange.</div>";
    return;
  }

  networkQueueDiv.innerHTML = networkQueue.map(msg => `
    <div class="queue-item">
      <strong>Msg #${msg.id}</strong> von Node ${msg.from} an Node ${msg.to}<br/>
      Payload: <code>${msg.payload}</code><br/>
      <span class="small">Lamport=${msg.lamport} | Vector=[${msg.vector.join(",")}]</span>
    </div>
  `).join("");
}

function renderGlobalLog() {
  if (globalEventLog.length === 0) {
    eventLogDiv.innerHTML = "<div class='small'>Noch keine Events vorhanden.</div>";
    return;
  }

  eventLogDiv.innerHTML = [...globalEventLog].reverse().map(event => `
    <div class="log-item">
      <strong>#${event.id}</strong> Node ${event.nodeId} – ${event.type}<br/>
      <span class="small">Lamport=${event.lamport} | Vector=[${event.vector.join(",")}]</span>
    </div>
  `).join("");
}

function renderDynamoView() {
  const allVersions = nodes.map(node => {
    return `
      <div class="log-item">
        <strong>Node ${node.id}</strong><br/>
        ${
          node.versions.length === 0
            ? "<span class='small'>Keine Versionen.</span>"
            : node.versions.map(v =>
                `<div class="version-item ${node.versions.length > 1 ? "concurrent" : "descendant"}">
                  Wert: <code>${v.value}</code><br/>
                  <span class="small">Vector=[${v.vector.join(",")}]</span>
                 </div>`
              ).join("")
        }
      </div>
    `;
  }).join("");

  dynamoViewDiv.innerHTML = allVersions;
}

function renderAll() {
  renderNodes();
  renderQueue();
  renderGlobalLog();
  renderDynamoView();
  renderCompareSelectors();
}

initialize();

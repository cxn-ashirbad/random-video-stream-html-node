const WebSocket = require("ws");
const wss = new WebSocket.Server({ port: 8080 });

const waitingUsers = new Set();
const connections = new Map();

wss.on("connection", (ws) => {
  ws.id = Math.random().toString(36).substr(2, 9);

  ws.send(
    JSON.stringify({
      type: "id",
      id: ws.id,
    })
  );

  ws.on("message", (message) => {
    const data = JSON.parse(message);

    switch (data.type) {
      case "waiting":
        handleWaitingUser(ws);
        break;
      case "offer":
      case "answer":
      case "ice-candidate":
        forwardMessage(data);
        break;
      case "disconnect":
        handleDisconnect(ws);
        break;
    }
  });

  ws.on("close", () => {
    handleDisconnect(ws);
  });
});

function handleWaitingUser(ws) {
  // Disconnect from current partner if any
  if (connections.has(ws.id)) {
    const partnerId = connections.get(ws.id);
    connections.delete(partnerId);
    connections.delete(ws.id);

    const partner = [...wss.clients].find((client) => client.id === partnerId);
    if (partner) {
      partner.send(JSON.stringify({ type: "partner-disconnected" }));
    }
  }

  // Try to find a new partner
  const availablePartner = [...waitingUsers].find((id) => id !== ws.id);

  if (availablePartner) {
    waitingUsers.delete(availablePartner);
    const partner = [...wss.clients].find(
      (client) => client.id === availablePartner
    );

    if (partner) {
      connections.set(ws.id, partner.id);
      connections.set(partner.id, ws.id);

      ws.send(JSON.stringify({ type: "partner-found", initiator: true }));
      partner.send(JSON.stringify({ type: "partner-found", initiator: false }));
    }
  } else {
    waitingUsers.add(ws.id);
  }
}

function handleDisconnect(ws) {
  waitingUsers.delete(ws.id);

  if (connections.has(ws.id)) {
    const partnerId = connections.get(ws.id);
    connections.delete(partnerId);
    connections.delete(ws.id);

    const partner = [...wss.clients].find((client) => client.id === partnerId);
    if (partner) {
      partner.send(JSON.stringify({ type: "partner-disconnected" }));
    }
  }
}

function forwardMessage(data) {
  if (!data.from) {
    return;
  }
  const partner = [...wss.clients].find(
    (client) => client.id === connections.get(data.from)
  );
  if (partner) {
    data.from = data.from;
    partner.send(JSON.stringify(data));
  }
}

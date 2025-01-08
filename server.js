// Import WebSocket library and create server on port 8080
const WebSocket = require("ws");
const wss = new WebSocket.Server({ port: 8080 });

// Track users waiting for partners and active connections between users
const waitingUsers = new Set();
const connections = new Map();

// Handle new WebSocket connections
wss.on("connection", (ws) => {
  // Generate random ID and initialize username for new connection
  ws.id = Math.random().toString(36).substr(2, 9);
  ws.username = null;

  // Send client their assigned ID
  ws.send(
    JSON.stringify({
      type: "id",
      id: ws.id,
    })
  );

  // Handle incoming messages
  ws.on("message", (message) => {
    const data = JSON.parse(message);

    // Store username if provided
    if (data.username) {
      ws.username = data.username;
    }

    // Route message to appropriate handler based on type
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

  // Clean up when client disconnects
  ws.on("close", () => {
    handleDisconnect(ws);
  });
});

/**
 * Handles users waiting to be matched with a chat partner
 * - Disconnects from current partner if exists
 * - Attempts to find new available partner
 * - If partner found, establishes connection between users
 * - If no partner available, adds user to waiting pool
 */
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
    // Partner found - establish connection
    waitingUsers.delete(availablePartner);
    const partner = [...wss.clients].find(
      (client) => client.id === availablePartner
    );

    if (partner) {
      // Create bidirectional connection mapping
      connections.set(ws.id, partner.id);
      connections.set(partner.id, ws.id);

      // Notify both users of successful match
      ws.send(
        JSON.stringify({
          type: "partner-found",
          initiator: true,
          partnerName: partner.username,
        })
      );
      partner.send(
        JSON.stringify({
          type: "partner-found",
          initiator: false,
          partnerName: ws.username,
        })
      );
    }
  } else {
    // No partner available - add to waiting pool
    waitingUsers.add(ws.id);
  }
}

/**
 * Handles user disconnection
 * - Removes user from waiting pool
 * - Notifies and disconnects partner if exists
 */
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

/**
 * Forwards WebRTC signaling messages between connected partners
 * - Validates message has sender ID
 * - Looks up partner and forwards message if found
 */
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

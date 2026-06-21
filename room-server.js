#!/usr/bin/env node

const http = require("http");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 8787);
const ROOM_TTL = 12000;
const clients = new Map();
const rooms = new Map();

function roomList() {
  const now = Date.now();
  cleanupRooms(now);
  return [...rooms.values()].map((room) => ({
    code: room.code,
    hostId: room.hostId,
    title: `房间 ${room.code}`,
    players: room.guestId ? 2 : 1,
    capacity: 2,
    status: room.guestId ? "playing" : "waiting",
    targetScore: room.targetScore,
    playStyle: room.playStyle,
    updatedAt: room.updatedAt,
  }));
}

function cleanupRooms(now = Date.now()) {
  for (const [code, room] of rooms) {
    if (now - room.updatedAt > ROOM_TTL || !clients.has(room.hostId)) {
      rooms.delete(code);
      notifyPeer(room.guestId, { type: "peer-left", roomCode: code });
    }
  }
}

function randomRoomCode() {
  let code = "";
  do {
    code = Math.random().toString(36).slice(2, 6).toUpperCase();
  } while (rooms.has(code));
  return code;
}

function send(socket, packet) {
  if (!socket || socket.destroyed) return;
  socket.write(encodeFrame(JSON.stringify(packet)));
}

function notifyPeer(clientId, packet) {
  const client = clients.get(clientId);
  if (client) send(client.socket, packet);
}

function broadcastRooms() {
  const roomsPayload = roomList();
  for (const client of clients.values()) {
    send(client.socket, { type: "rooms", rooms: roomsPayload });
  }
}

function leaveRoom(clientId) {
  for (const [code, room] of rooms) {
    if (room.hostId === clientId) {
      rooms.delete(code);
      notifyPeer(room.guestId, { type: "peer-left", roomCode: code });
    } else if (room.guestId === clientId) {
      room.guestId = "";
      room.updatedAt = Date.now();
      notifyPeer(room.hostId, { type: "peer-left", roomCode: code });
    }
  }
}

function handlePacket(client, packet) {
  const clientId = String(packet.clientId || client.id);
  client.id = clientId;
  clients.set(clientId, client);

  if (packet.type === "hello" || packet.type === "list-rooms") {
    send(client.socket, { type: "rooms", rooms: roomList() });
    return;
  }

  if (packet.type === "create-room") {
    leaveRoom(clientId);
    const code = randomRoomCode();
    const room = {
      code,
      hostId: clientId,
      guestId: "",
      targetScore: Number(packet.targetScore) === 11 ? 11 : 7,
      playStyle: packet.playStyle === "fun" ? "fun" : "standard",
      updatedAt: Date.now(),
    };
    rooms.set(code, room);
    send(client.socket, { type: "room-created", room, rooms: roomList() });
    broadcastRooms();
    return;
  }

  if (packet.type === "join-room") {
    const code = String(packet.roomCode || "").toUpperCase();
    const room = rooms.get(code);
    if (!room || room.guestId || room.hostId === clientId) {
      send(client.socket, { type: "error", message: "房间已不可加入。" });
      return;
    }
    leaveRoom(clientId);
    room.guestId = clientId;
    room.updatedAt = Date.now();
    send(client.socket, { type: "room-joined", room, hostId: room.hostId, rooms: roomList() });
    notifyPeer(room.hostId, { type: "peer-joined", roomCode: code, peerId: clientId });
    broadcastRooms();
    return;
  }

  if (packet.type === "room-heartbeat") {
    const room = rooms.get(String(packet.roomCode || "").toUpperCase());
    if (room && room.hostId === clientId) {
      room.targetScore = Number(packet.targetScore) === 11 ? 11 : 7;
      room.playStyle = packet.playStyle === "fun" ? "fun" : "standard";
      room.updatedAt = Date.now();
    }
    return;
  }

  if (packet.type === "leave-room") {
    leaveRoom(clientId);
    broadcastRooms();
    return;
  }

  if (packet.type === "relay") {
    const room = rooms.get(String(packet.roomCode || "").toUpperCase());
    if (!room) return;
    const targetId = clientId === room.hostId ? room.guestId : room.hostId;
    notifyPeer(targetId, {
      type: "relay",
      roomCode: room.code,
      senderId: clientId,
      payload: packet.payload,
    });
  }
}

function encodeFrame(data) {
  const payload = Buffer.from(data);
  const length = payload.length;
  let header;
  if (length < 126) {
    header = Buffer.from([0x81, length]);
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  return Buffer.concat([header, payload]);
}

function decodeFrames(socket, chunk, onMessage) {
  socket.buffer = Buffer.concat([socket.buffer || Buffer.alloc(0), chunk]);
  while (socket.buffer.length >= 2) {
    const first = socket.buffer[0];
    const second = socket.buffer[1];
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let offset = 2;
    if (length === 126) {
      if (socket.buffer.length < offset + 2) return;
      length = socket.buffer.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      if (socket.buffer.length < offset + 8) return;
      length = Number(socket.buffer.readBigUInt64BE(offset));
      offset += 8;
    }
    if (!masked || socket.buffer.length < offset + 4 + length) return;
    const mask = socket.buffer.slice(offset, offset + 4);
    offset += 4;
    const payload = socket.buffer.slice(offset, offset + length);
    socket.buffer = socket.buffer.slice(offset + length);
    if (opcode === 0x8) {
      socket.end();
      return;
    }
    if (opcode !== 0x1) continue;
    for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i % 4];
    onMessage(payload.toString("utf8"));
  }
}

const server = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  res.end("Stick Badminton room server is running.\n");
});

server.on("upgrade", (req, socket) => {
  if ((req.headers.upgrade || "").toLowerCase() !== "websocket") {
    socket.destroy();
    return;
  }
  const key = req.headers["sec-websocket-key"];
  const accept = crypto.createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
  socket.write(
    [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${accept}`,
      "",
      "",
    ].join("\r\n"),
  );
  const client = { id: "", socket };
  socket.on("data", (chunk) => {
    decodeFrames(socket, chunk, (message) => {
      try {
        handlePacket(client, JSON.parse(message));
      } catch {
        send(socket, { type: "error", message: "消息格式错误。" });
      }
    });
  });
  socket.on("close", () => {
    if (client.id) {
      clients.delete(client.id);
      leaveRoom(client.id);
      broadcastRooms();
    }
  });
});

setInterval(() => {
  cleanupRooms();
  broadcastRooms();
}, 3000);

server.listen(PORT, () => {
  console.log(`Room server listening on ws://localhost:${PORT}`);
});

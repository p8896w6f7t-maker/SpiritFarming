const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT || 10000);
const ROOT = __dirname;
const rooms = new Map();
const clients = new Map();

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function safePath(urlPath) {
  const clean = decodeURIComponent((urlPath || '/').split('?')[0]);
  const requested = clean === '/' ? '/index.html' : clean;
  const full = path.normalize(path.join(ROOT, requested));
  if (!full.startsWith(ROOT)) return null;
  return full;
}

function makeId() {
  return crypto.randomBytes(6).toString('hex');
}

function makeRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}

function publicPlayers(room) {
  return [...room.players.values()].map(p => ({ ...p }));
}

function send(ws, type, data = {}) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({ type, ...data }));
  }
}

function broadcast(room, type, data = {}, exceptId = null) {
  for (const p of room.players.values()) {
    if (p.id !== exceptId) send(p.ws, type, data);
  }
}

function leaveRoom(client) {
  if (!client.roomCode) return;
  const room = rooms.get(client.roomCode);
  client.roomCode = null;
  if (!room) return;

  room.players.delete(client.id);
  broadcast(room, 'player-left', { id: client.id });

  if (room.players.size === 0) {
    rooms.delete(room.code);
  }
}

const server = http.createServer((req, res) => {
  const file = safePath(req.url);
  if (!file) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(file, 'utf8', (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }

    // The original game stays untouched. The server injects multiplayer.js
    // only when it serves index.html.
    if (path.basename(file) === 'index.html') {
      data = data.replace(
        /<\/body>/i,
        '<script src="/multiplayer.js"></script>\n</body>'
      );
    }

    res.writeHead(200, {
      'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', ws => {
  const client = {
    id: makeId(),
    ws,
    roomCode: null,
    player: null
  };
  clients.set(client.id, client);

  send(ws, 'connected', { id: client.id });

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); }
    catch { return; }

    if (!msg || typeof msg.type !== 'string') return;

    if (msg.type === 'create-room') {
      leaveRoom(client);
      const code = makeRoomCode();
      const room = { code, players: new Map() };
      rooms.set(code, room);
      client.roomCode = code;
      client.player = {
        id: client.id,
        nickname: String(msg.nickname || '플레이어').slice(0, 12),
        outfitColor: String(msg.outfitColor || '#5476a5'),
        location: String(msg.location || 'farm'),
        x: Number(msg.x) || 50,
        y: Number(msg.y) || 68,
        direction: String(msg.direction || 'down')
      };
      room.players.set(client.id, { ...client.player, ws });
      send(ws, 'room-created', { code, players: publicPlayers(room) });
      return;
    }

    if (msg.type === 'join-room') {
      leaveRoom(client);
      const code = String(msg.code || '').trim().toUpperCase();
      const room = rooms.get(code);
      if (!room) return send(ws, 'error', { message: '방을 찾을 수 없습니다.' });
      if (room.players.size >= 8) return send(ws, 'error', { message: '방이 가득 찼습니다. (최대 8명)' });

      client.roomCode = code;
      client.player = {
        id: client.id,
        nickname: String(msg.nickname || '플레이어').slice(0, 12),
        outfitColor: String(msg.outfitColor || '#5476a5'),
        location: String(msg.location || 'farm'),
        x: Number(msg.x) || 50,
        y: Number(msg.y) || 68,
        direction: String(msg.direction || 'down')
      };
      room.players.set(client.id, { ...client.player, ws });
      send(ws, 'room-joined', { code, players: publicPlayers(room) });
      broadcast(room, 'player-joined', { player: client.player }, client.id);
      return;
    }

    if (msg.type === 'state') {
      if (!client.roomCode || !client.player) return;
      const room = rooms.get(client.roomCode);
      if (!room) return;

      const p = room.players.get(client.id);
      if (!p) return;

      p.nickname = String(msg.nickname || p.nickname).slice(0, 12);
      p.outfitColor = String(msg.outfitColor || p.outfitColor);
      p.location = String(msg.location || p.location);
      p.x = Number.isFinite(Number(msg.x)) ? Number(msg.x) : p.x;
      p.y = Number.isFinite(Number(msg.y)) ? Number(msg.y) : p.y;
      p.direction = String(msg.direction || p.direction);

      broadcast(room, 'player-state', {
        player: {
          id: p.id,
          nickname: p.nickname,
          outfitColor: p.outfitColor,
          location: p.location,
          x: p.x,
          y: p.y,
          direction: p.direction
        }
      }, client.id);
      return;
    }

    if (msg.type === 'leave-room') {
      leaveRoom(client);
      send(ws, 'left-room');
      return;
    }
  });

  ws.on('close', () => {
    leaveRoom(client);
    clients.delete(client.id);
  });
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
});

process.on('SIGTERM', () => {
  clearInterval(heartbeat);
  for (const ws of wss.clients) ws.close(1001, 'server shutdown');
  server.close(() => process.exit(0));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`SpiritFarming multiplayer server listening on ${PORT}`);
});

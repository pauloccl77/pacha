/**
 * Pacha Multiplayer Server
 * ─────────────────────────
 * Servidor WebSocket que agrupa jugadores en salas y retransmite mensajes.
 *
 * Conceptos:
 *  - Sala (room): un código compartido (ej. "BOSQUE-1234") que une a 2 jugadores
 *  - Cada sala tiene una "seed" generada al crearla, para que ambos clientes
 *    generen el mismo mundo (mismas posiciones de plantas, vertiente, etc.)
 *  - El servidor NO simula el juego, solo retransmite mensajes entre clientes
 */

const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;

// ─── Almacén de salas en memoria ────────────────────────────────────────────
// Map<roomCode, { host: ws, guest: ws, seed: number, mission: object, created: number }>
const rooms = new Map();

// Limpieza periódica: salas inactivas > 2h se eliminan
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    if (now - room.lastActivity > 2 * 60 * 60 * 1000) {
      console.log(`[cleanup] removing inactive room ${code}`);
      rooms.delete(code);
    }
  }
}, 5 * 60 * 1000);

// ─── Helpers ────────────────────────────────────────────────────────────────
function generateRoomCode() {
  // Código tipo "BOSQUE-1234" — corto y memorable
  const num = Math.floor(1000 + Math.random() * 9000);
  return `BOSQUE-${num}`;
}

function generateSeed() {
  // Seed numérica para sincronizar mundo
  return Math.floor(Math.random() * 1000000);
}

function send(ws, type, data) {
  if (ws && ws.readyState === 1) {
    try {
      ws.send(JSON.stringify({ type, ...data }));
    } catch (e) {
      console.error('send error:', e.message);
    }
  }
}

function broadcastToRoom(room, type, data, exceptWs = null) {
  for (const ws of [room.host, room.guest]) {
    if (ws && ws !== exceptWs) send(ws, type, data);
  }
}

function getOpponent(room, ws) {
  return ws === room.host ? room.guest : room.host;
}

// ─── Servidor HTTP + WebSocket ──────────────────────────────────────────────
const server = http.createServer((req, res) => {
  // Endpoint de salud para Cloud Run
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    return;
  }
  // Endpoint informativo
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    service: 'pacha-multiplayer',
    rooms: rooms.size,
    uptime: process.uptime(),
  }));
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  console.log(`[conn] new connection from ${req.socket.remoteAddress}`);
  ws.isAlive = true;
  ws.roomCode = null;
  ws.role = null; // 'host' | 'guest'

  // Heartbeat para detectar desconexiones
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (e) {
      send(ws, 'error', { message: 'invalid_json' });
      return;
    }

    const { type } = msg;

    // ── Crear sala ───────────────────────────────────────────────────
    if (type === 'create_room') {
      const code = generateRoomCode();
      const seed = generateSeed();
      const room = {
        host: ws,
        guest: null,
        seed,
        mission: null,         // se setea cuando el host elige dificultad
        difficulty: null,
        gameStarted: false,
        lastActivity: Date.now(),
      };
      rooms.set(code, room);
      ws.roomCode = code;
      ws.role = 'host';
      console.log(`[room] created ${code} (seed=${seed})`);
      send(ws, 'room_created', { code, seed, role: 'host' });
      return;
    }

    // ── Unirse a sala ────────────────────────────────────────────────
    if (type === 'join_room') {
      const code = (msg.code || '').toUpperCase().trim();
      const room = rooms.get(code);
      if (!room) {
        send(ws, 'join_failed', { reason: 'not_found' });
        return;
      }
      if (room.guest) {
        send(ws, 'join_failed', { reason: 'full' });
        return;
      }
      room.guest = ws;
      room.lastActivity = Date.now();
      ws.roomCode = code;
      ws.role = 'guest';
      console.log(`[room] ${code} guest joined`);
      // Confirmar al guest
      send(ws, 'joined', {
        code,
        seed: room.seed,
        role: 'guest',
        difficulty: room.difficulty,
        mission: room.mission,
      });
      // Avisar al host que su compañero llegó
      send(room.host, 'peer_joined', {});
      return;
    }

    // A partir de aquí, todos los mensajes requieren estar en una sala
    const room = rooms.get(ws.roomCode);
    if (!room) {
      send(ws, 'error', { message: 'no_room' });
      return;
    }
    room.lastActivity = Date.now();

    // ── Host define la misión y dificultad ──────────────────────────
    if (type === 'set_mission') {
      if (ws.role !== 'host') {
        send(ws, 'error', { message: 'only_host_can_set_mission' });
        return;
      }
      room.difficulty = msg.difficulty;
      room.mission = msg.mission;
      console.log(`[room] ${ws.roomCode} mission set: ${JSON.stringify(msg.mission)}`);
      // Si ya hay guest, notificar
      if (room.guest) {
        send(room.guest, 'mission_set', {
          difficulty: msg.difficulty,
          mission: msg.mission,
        });
      }
      return;
    }

    // ── Layout del mundo (host envía, guest recibe) ───────────────
    if (type === 'world_layout') {
      if (ws.role !== 'host') return;
      room.worldLayout = msg.layout;
      if (room.guest) {
        send(room.guest, 'world_layout', { layout: msg.layout });
      }
      return;
    }

    if (type === 'request_world_layout') {
      if (room.worldLayout) {
        send(ws, 'world_layout', { layout: room.worldLayout });
      }
      return;
    }

    // ── Comenzar partida (solo el host) ─────────────────────────────
    if (type === 'start_game') {
      if (ws.role !== 'host') return;
      if (!room.guest) {
        send(ws, 'error', { message: 'no_guest' });
        return;
      }
      room.gameStarted = true;
      console.log(`[room] ${ws.roomCode} game started`);
      broadcastToRoom(room, 'game_started', {});
      return;
    }

    // ── Posición del jugador (alta frecuencia, ~15Hz) ───────────────
    if (type === 'pose') {
      // Reenviar al otro jugador
      const peer = getOpponent(room, ws);
      send(peer, 'peer_pose', {
        x: msg.x,
        z: msg.z,
        rotY: msg.rotY,
        moving: msg.moving,
        running: msg.running,
      });
      return;
    }

    // ── Eventos discretos: planta recogida, agua bebida, etc. ────────
    if (type === 'plant_collected') {
      // El servidor confía en el cliente y retransmite
      broadcastToRoom(room, 'plant_collected', {
        plantIndex: msg.plantIndex,
        counted: msg.counted,         // si sumó al objetivo
        species: msg.species,
        label: msg.label,
        collectedBy: ws.role,
      }, ws);  // no reenviarle a quien lo envió
      return;
    }

    if (type === 'water_drunk') {
      broadcastToRoom(room, 'water_drunk', {
        drunkBy: ws.role,
      }, ws);
      return;
    }

    // ── Sincronización del estado de la misión ──────────────────────
    if (type === 'mission_progress') {
      broadcastToRoom(room, 'mission_progress', {
        collected: msg.collected,
        collectedBySpecies: msg.collectedBySpecies,
      }, ws);
      return;
    }

    // ── Estado de salud del jugador ─────────────────────────────────
    if (type === 'water_state') {
      const peer = getOpponent(room, ws);
      send(peer, 'peer_water_state', {
        water: msg.water,
        dead: msg.dead,
      });
      return;
    }

    // ── Fin del juego (victoria o derrota) ──────────────────────────
    if (type === 'game_over') {
      broadcastToRoom(room, 'game_over', {
        result: msg.result, // 'win' | 'lose'
        triggeredBy: ws.role,
      }, ws);
      return;
    }

    // ── Chat / ping rápido (futuro) ──────────────────────────────────
    if (type === 'ping_marker') {
      const peer = getOpponent(room, ws);
      send(peer, 'peer_ping_marker', {
        x: msg.x, z: msg.z, kind: msg.kind,
      });
      return;
    }

    console.log(`[unknown] ${type}`);
  });

  ws.on('close', () => {
    console.log(`[conn] closed (role=${ws.role}, room=${ws.roomCode})`);
    if (ws.roomCode) {
      const room = rooms.get(ws.roomCode);
      if (room) {
        const peer = getOpponent(room, ws);
        send(peer, 'peer_disconnected', {});
        // Si el que se va era el host, se cierra la sala
        if (ws.role === 'host') {
          rooms.delete(ws.roomCode);
          console.log(`[room] ${ws.roomCode} closed (host left)`);
        } else {
          // Si era guest, dejar la sala abierta para que pueda reconectarse
          room.guest = null;
        }
      }
    }
  });

  ws.on('error', (err) => {
    console.error('[ws error]', err.message);
  });
});

// Heartbeat: pingea a clientes cada 30s y cierra los que no respondan
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      ws.terminate();
      return;
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, () => {
  console.log(`Pacha multiplayer server listening on :${PORT}`);
});

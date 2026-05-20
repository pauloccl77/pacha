# Servidor — Pacha (Node.js + WebSocket + Cloud Run)

Servidor de relay para el modo multijugador cooperativo. Sin estado persistente,
solo retransmite mensajes entre 2 clientes agrupados por código de sala.

> Si entras a este chat sin contexto previo, lee primero el `CLAUDE.md` de la raíz
> del repo para entender el proyecto completo.

## Stack

- **Runtime**: Node.js 20 (alpine slim en Docker)
- **WebSocket**: paquete `ws` (^8.18.0)
- **Hosting**: Cloud Run, región `southamerica-west1` (Santiago)
- **URL pública**: `https://pacha-multiplayer-950293517077.southamerica-west1.run.app`
- **Configuración crítica de Cloud Run**:
  - `--session-affinity` (necesario para WebSocket)
  - `--allow-unauthenticated`
  - `--min-instances 0` (hiberna sin tráfico → costo $0)
  - `--max-instances 1` (un servidor compartido — necesario para que las salas funcionen)
  - `--memory 256Mi`
  - `--timeout 3600` (1 hora por conexión)

## Archivos en este directorio

- `server.js` — servidor completo (~310 líneas)
- `package.json` — dependencias y script `start`
- `Dockerfile` — imagen basada en `node:20-slim`
- `.dockerignore` — excluye `node_modules`, `.git`, etc.

## Protocolo de mensajes

Todos los mensajes son JSON con campo `type`. Cliente → servidor:

| Type | Sentido | Quién |
|------|---------|-------|
| `create_room` | Crear sala nueva | Cualquiera |
| `join_room` | Unirse con código | Cualquiera |
| `set_mission` | Definir misión (difficulty + mission) | Host |
| `world_layout` | Enviar layout del mundo (pond + plants) | Host |
| `request_world_layout` | Pedir layout al servidor | Guest |
| `start_game` | Iniciar partida | Host |
| `pose` | Posición del jugador (15 Hz) | Cualquiera |
| `plant_collected` | Planta recogida | Cualquiera |
| `water_drunk` | Bebió en vertiente | Cualquiera |
| `water_state` | Cambio de nivel de agua | Cualquiera |
| `game_over` | Fin de partida | Cualquiera |
| `ping_marker` | Marca en el mapa (futuro) | Cualquiera |

Servidor → cliente: ver implementación en `server.js`.

## Estado en memoria

```js
rooms: Map<roomCode, {
  host: WebSocket,
  guest: WebSocket | null,
  seed: number,
  mission: { species: count, ... } | null,
  difficulty: number | null,
  worldLayout: { pond: {x,z}, plants: [{species,x,z},...] } | null,
  gameStarted: boolean,
  lastActivity: timestamp
}>
```

Limpieza automática: salas inactivas >2h se eliminan.

## Reglas críticas

1. **El servidor no simula el juego**. Solo retransmite. La lógica de juego corre
   en los clientes. El host es la fuente de verdad para el layout del mundo.
2. **No agregar dependencias innecesarias**. `ws` es la única dependencia y debe
   seguir así. Si necesitas algo más, justifícalo.
3. **Mantener `--max-instances 1`**. Las salas viven en memoria; con múltiples
   instancias se pierde la coherencia. Si en el futuro se necesita escalar,
   habría que migrar a Redis o similar.
4. **`session-affinity` es obligatorio**. Sin él, los mensajes de un cliente
   pueden ir a instancias diferentes y romper la conexión WebSocket.
5. **Sin persistencia**. Decisión consciente: el juego es casual, no hay datos
   que merezcan una base de datos.

## Comandos de despliegue

### Primer despliegue / redespliegue
```bash
gcloud run deploy pacha-multiplayer \
  --source . \
  --region southamerica-west1 \
  --allow-unauthenticated \
  --port 8080 \
  --min-instances 0 \
  --max-instances 1 \
  --memory 256Mi \
  --timeout 3600 \
  --session-affinity
```

### Apagar (costo $0 garantizado)
```bash
gcloud run services update pacha-multiplayer \
  --region southamerica-west1 \
  --max-instances 0
```

### Reactivar
```bash
gcloud run services update pacha-multiplayer \
  --region southamerica-west1 \
  --max-instances 1
```

### Eliminar completamente
```bash
gcloud run services delete pacha-multiplayer \
  --region southamerica-west1
```

### Probar localmente antes de desplegar
```bash
npm install
node server.js
# Cliente debe usar ws://localhost:8080 en vez de wss://...
```

### Ver logs
```bash
gcloud run logs read pacha-multiplayer \
  --region southamerica-west1 \
  --limit 100
```

### Ver tráfico en tiempo real
```bash
gcloud run logs tail pacha-multiplayer \
  --region southamerica-west1
```

## Endpoint de salud

GET `/health` → `200 OK` con texto `OK`.
GET `/` → JSON con `service`, `rooms` (count), `uptime`.

Útil para verificar que el servicio está vivo sin abrir el juego.

## Costos GCP

- Free tier de Cloud Run cubre **2M requests/mes**, **360.000 GB-s memoria**,
  **180.000 vCPU-s**. Nuestro uso real cabe holgadamente.
- Con `--min-instances 0`, cuando no hay jugadores el costo es estrictamente $0.
- Cold start: ~3-5 segundos en la primera conexión tras hibernación.
- Los $300 USD de crédito inicial **ya están consumidos** en otros proyectos.
  Operamos solo con el free tier permanente.

## Áreas conocidas para mejorar

- Validación de mensajes entrantes (hoy se confía en el cliente)
- Rate limiting por IP
- Reconexión automática del cliente si se cae
- Métricas custom (jugadores activos, salas creadas) a Cloud Monitoring
- Migrar a Redis si en el futuro hay >2 instancias

## Flujo de trabajo

Trabajo en paralelo con dos herramientas:

1. **claude.ai Project "Multijugador"**: diseño de protocolo, evaluación de
   alternativas, dudas conceptuales (GCP, WebSocket, latencia).
2. **Claude Code** (este entorno): implementación, despliegue, debugging.

Cuando vengo de un Project, lo menciono al inicio del prompt:

> "Vengo del Project 'Multijugador' donde acordamos agregar reconexión
>  automática. Implementémoslo en `server.js` y luego en el cliente."

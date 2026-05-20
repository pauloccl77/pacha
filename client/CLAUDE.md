# Cliente — Pacha (HTML + Three.js)

Este directorio contiene el cliente del juego: un único archivo `index.html`
autocontenido que corre en cualquier navegador moderno (móvil o desktop).

> Si entras a este chat sin contexto previo, lee primero el `CLAUDE.md` de la raíz
> del repo para entender el proyecto completo.

## Características del cliente

- **Archivo único**: `index.html` (~80 KB, ~2.700 líneas)
- **Three.js r128** cargado desde CDN: `https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js`
- **Sin bundlers, sin frameworks**: JavaScript vanilla
- **Controles**:
  - Touch: joystick virtual + drag de cámara
  - Desktop: WASD + mouse
  - Pantalla completa (oculta en iOS donde la API no funciona)
- **Versión visible**: esquina inferior derecha, `<div id="version-tag">`

## Estructura interna del archivo

El `index.html` contiene en orden:

1. **CSS** (~270 líneas): pantallas (título, lobby, briefing, fin), HUD, controles
2. **HTML del UI** (~80 líneas): contenedores para cada pantalla y controles
3. **JavaScript**:
   - Setup de Three.js (renderer, escena, luces)
   - Terreno (PlaneGeometry con `hAt()` para ondulaciones, interpolación bilineal `meshGroundY()`)
   - Árboles, rocas, pasto (InstancedMesh para rocas y pasto)
   - Vertiente (`pondGroup`) — posición aleatoria por sesión
   - Plantas interactuables (5 especies: Maqui, Frutilla, Peumo, Palqui, Matico)
   - Personaje aymara (geometría compuesta de primitivas)
   - Zorro Culpeo con AI (`updateFox()`)
   - Cámara TPS (`camYaw`, `camPitch`, `camDist`)
   - Controles táctiles (joystick + cam-zone)
   - Game state (`game.water`, `game.mission`, etc.)
   - Sistema multijugador (`net.*`, `peerChar`, `peerState`)
   - Loop de animación (`animate()`)

## Convenciones de código

- Indentación: 2 espacios
- Strings: comillas simples `'`
- Sin punto y coma al final (estilo conciso, pero respetar el existente — si el archivo
  ya usa `;`, mantenlo)
- Variables descriptivas en castellano cuando aplica a dominio del juego (vertiente,
  bosque), inglés para conceptos técnicos genéricos (interactables, animate)
- Comentarios con `// ──` para separar secciones

## Reglas críticas

1. **Mantener el archivo autocontenido**. No fragmentar en módulos ES6 ni usar imports
   externos salvo el CDN de Three.js.
2. **No subir versión de Three.js**. r128 es la versión probada y compatible. Si
   piensas que un cambio mayor lo requiere, propón primero.
3. **Probar mentalmente en móvil**. iPhone 11 y Galaxy Tab A11 son los dispositivos
   objetivo. WebGL básico, sin features experimentales.
4. **No tocar `meshGroundY()`** sin entender por qué existe. Resolvió el bug del
   personaje hundiéndose en el terreno usando interpolación bilineal sobre los
   vértices del mesh (no usar `hAt()` directamente para snap al suelo).
5. **InstancedMesh para grass y rocks** ya está optimizado. No volver a meshes
   individuales sin razón fuerte.
6. **Incrementar `<div id="version-tag">vX.Y.Z</div>`** en cada cambio significativo.

## Multijugador en el cliente

- WebSocket URL: configurada en la constante `WS_URL` al inicio del módulo de red
- Variable global `net` mantiene estado: `ws`, `role`, `code`, `seed`, `isSolo`, etc.
- El **host** genera el mundo y envía el `worldLayoutCache` al servidor
- El **guest** recibe el layout vía mensaje `world_layout` y lo usa en `seedWorld()`
- Posiciones se sincronizan a 15 Hz (`POSE_INTERVAL = 1/15`)
- Personaje remoto: `peerChar` con interpolación suave en `peerState`

## Despliegue del cliente

El cliente se sirve estáticamente. Opciones:

- **GitHub Pages** (recomendado para pruebas): pushear a la rama `main` del repo
- **Cloudflare Pages** / **Netlify**: drag & drop del archivo
- **Servidor propio**: cualquier hosting estático sirve

No requiere build step. El archivo HTML es el deliverable directo.

## Áreas conocidas para mejorar

- El personaje y el zorro son geometrías primitivas; idealmente cargar modelos `.glb`
  (Mixamo o similar) cuando estén disponibles
- Sistema de habilidades / inventario no implementado
- No hay ciclo día/noche
- No hay sonido ambiente

## Comandos útiles desde esta carpeta

```bash
# Servir localmente para pruebas
python3 -m http.server 8000
# Luego abrir http://localhost:8000

# Validar HTML
npx html-validate index.html
```

# Pacha — Bosque Cooperativo Aymara

Juego sandbox cooperativo en 3D ambientado en el bosque esclerófilo del valle central de
Chile. Personaje aymara que debe recolectar plantas medicinales y alimenticias chilenas
para completar una misión, mientras gestiona su hidratación bebiendo de una vertiente.

## Contexto del autor

Soy Paulo, data engineer chileno (15+ años, principalmente Microsoft Fabric/Azure).
Desarrollo este juego como proyecto personal con dos objetivos:

1. **Aprender** nuevas tecnologías: GCP (Cloud Run, Cloud Build, Artifact Registry),
   prompting con Claude, desarrollo web moderno, Docker, WebSocket.
2. **Compartir tiempo con mis hijas** — son las probadoras oficiales y dan feedback
   honesto. Dispositivos de prueba: iPhone 11 y Galaxy Tab A11.

## Estado del juego

- Versión actual: **v0.3.2**
- El número de versión se mantiene visible en la esquina inferior derecha del juego.
- Cada cambio significativo incrementa la versión (patch para fixes, minor para
  funcionalidades, major para cambios disruptivos).

## Stack técnico

### Cliente (`client/index.html`)
- HTML único autocontenido (sin bundlers, sin frameworks)
- Three.js r128 cargado desde CDN
- Controles touch (joystick virtual + drag de cámara)
- Compatible con móvil iOS/Android y desktop
- ~2.700 líneas, ~80 KB

### Servidor (`server/`)
- Node.js con paquete `ws` (WebSocket)
- Sistema de salas con código compartido (BOSQUE-####)
- Desplegado en Cloud Run (región `southamerica-west1`)
- Stateless en memoria (sin base de datos)
- URL: `https://pacha-multiplayer-950293517077.southamerica-west1.run.app`

## Mecánicas actuales

- Tercera persona, controles táctiles
- Misión: recolectar plantas chilenas (maqui, frutilla del monte, peumo, palqui, matico)
- Dificultad: Básico 3 / Medio 5 / Avanzado 10
- 35% de plantas son "ruido" (no cuentan para la misión)
- Agua: 2 niveles, 60s + 30s, beber en la vertiente reinicia
- Tinte rojo progresivo en pantalla durante el último nivel de agua
- Fauna: zorro culpeo con AI (wander/pause/flee)
- Multijugador cooperativo (2 jugadores comparten misión, gestionan agua individual)

## Reglas importantes para Claude

1. **No romper compatibilidad móvil.** El joystick virtual y el drag de cámara son
   críticos. Cualquier feature debe seguir funcionando en touch.
2. **Mantener el archivo cliente autocontenido.** Sin bundlers, sin imports de NPM
   en el cliente. Solo CDN para Three.js.
3. **Incrementar la versión visible** (`<div id="version-tag">vX.Y.Z</div>`) en cada
   cambio. Patch para fixes, minor para funcionalidades, major para cambios disruptivos.
4. **Confirmar antes de cambios grandes.** Si vas a refactorizar más de 50 líneas o
   tocar arquitectura, propón primero.
5. **Optimizar conservando calidad visual.** Mis hijas notan si algo se ve "raro" o
   se vuelve lento. No sacrificar fluidez ni atmósfera.
6. **Estilo cultural respetuoso.** Bosque chileno real (especies que existen),
   personaje aymara sin caricaturizar. Tono familiar, sin violencia.
7. **Nada de frameworks pesados.** No migrar a React, Vue o similares salvo
   acuerdo explícito. El espíritu del proyecto es JS vanilla aprendido a fondo.

## Comandos útiles

### Desplegar servidor
```bash
cd server
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

### Ver logs del servidor
```bash
gcloud run logs read pacha-multiplayer --region southamerica-west1 --limit 50
```

### Apagar servidor para evitar costos
```bash
gcloud run services update pacha-multiplayer --region southamerica-west1 --max-instances 0
```

### Reactivar servidor
```bash
gcloud run services update pacha-multiplayer --region southamerica-west1 --max-instances 1
```

## Costos GCP

- Los $300 USD de crédito inicial **ya están consumidos** (proyecto anterior).
- Operamos en **free tier** de Cloud Run.
- `--min-instances 0` asegura hibernación cuando no hay tráfico.
- Cuando no se esté usando, **apagar el servicio** (poniendo max-instances=0).

## Flujo de trabajo

Trabajo en paralelo con dos herramientas:

1. **claude.ai Projects** (5 proyectos especializados):
   - Optimización de código
   - Mejoras de jugabilidad
   - Multijugador
   - Gráficas
   - Aprendizaje y exploración técnica
2. **Claude Code** (este entorno):
   - Implementación directa de los acuerdos tomados en los Projects
   - Operaciones sobre archivos y comandos en mi máquina
   - Despliegues a Cloud Run

Cuando recibo instrucciones que vienen de un Project de claude.ai, normalmente las
copio al inicio del prompt en Claude Code así:

> "Vengo del Project 'Jugabilidad' donde acordamos X. Implementa esto basándote en
>  la función `updateFox` del cliente."

## Estructura del repositorio

```
pacha/
├── CLAUDE.md              ← este archivo
├── README.md              ← descripción pública para el repo
├── client/
│   ├── index.html         ← el juego completo
│   └── CLAUDE.md          ← instrucciones específicas del cliente
├── server/
│   ├── server.js          ← servidor WebSocket
│   ├── package.json
│   ├── Dockerfile
│   ├── .dockerignore
│   └── CLAUDE.md          ← instrucciones específicas del servidor
└── docs/
    └── decisions.md       ← bitácora de decisiones de diseño
```

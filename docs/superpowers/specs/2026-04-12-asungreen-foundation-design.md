# AsunGreen — Sub-proyecto 1: Fundación del Mapa
**Fecha:** 2026-04-12
**Estado:** Aprobado
**Scope:** Mapa funcional + sistema visual neon-terminal completo

---

## Visión del Proyecto

AsunGreen es una plataforma de monitoreo ambiental y análisis de políticas urbanas para Asunción, Paraguay. Combina datos satelitales reales (NASA MODIS), simulación de tráfico y análisis de espacios verdes en una interfaz de alta calidad visual destinada a portafolio profesional e impacto real municipal.

**Roadmap completo (4 sub-proyectos):**
1. **Fundación del mapa** ← este spec
2. Capas de datos reales (OSM: colectivos, parques, zonas verdes)
3. Modal de análisis rápido por zona/capa
4. Reporte/Paper páginas `/analysis` por tema

---

## Sub-proyecto 1: Fundación del Mapa

### Objetivo
Dejar el mapa completamente funcional, sin errores en consola, con el nuevo sistema visual neon-terminal aplicado a todos los componentes.

### Problemas actuales a resolver
- CartoCDN bloqueado en red del usuario → reemplazar con basemap vectorial custom
- NASA GIBS WMTS no existe en EPSG:3857 para NDVI/LST → ya migrado a WMS (mantener)
- Diseño actual (glassmorphism) → reemplazar con sistema neon-terminal

---

## Sistema Visual

### Paleta de colores
```css
--bg-base:        #030804;   /* fondo principal */
--bg-surface:     #0a0f0a;   /* panels/cards */
--bg-border:      #0d2b12;   /* bordes dark */
--neon-green:     #00ff88;   /* color protagonista (Claude Code) */
--neon-cyan:      #00e5ff;   /* temperatura, agua */
--neon-magenta:   #ff2d78;   /* alertas, pico de tráfico */
--neon-yellow:    #ffe600;   /* tráfico alto */
--neon-purple:    #bf5fff;   /* NDVI, vegetación */
--text-primary:   #a8ffb0;   /* texto principal */
--text-muted:     #2d5c35;   /* labels secundarios */
--text-bright:    #e0ffe8;   /* títulos activos */
```

### Tipografía
| Rol | Fuente | Uso |
|---|---|---|
| Display/HUD | Press Start 2P | Títulos, badges, botones |
| Data/Valores | VT323 | Números, coordenadas, timestamps |
| System text | Share Tech Mono | Labels, subtítulos, body |

### Efectos
- **Scan lines**: `repeating-linear-gradient` sutil en panels
- **Neon glow**: `text-shadow` + `box-shadow` en elementos activos con color variable
- **Cursor parpadeante**: `█` animado con `@keyframes blink` en header
- **ASCII borders**: caracteres `┌─┐│└┘` en cards del sidebar
- **Grid de fondo**: radial gradient sutil estilo radar/matrix
- **Glitch intro**: animación de clip-path en el título al cargar

---

## Layout

```
┌─────────────────────────────────────────────────────────┐
│  HEADER (48px) — terminal prompt + badges de sistema    │
├──────────┬──────────────────────────────────┬───────────┤
│ SIDEBAR  │         MAP (fullscreen)         │  LEGEND   │
│ (280px)  │   dark vector + neon overlays    │  (200px)  │
│          │                                  │           │
│  ASCII   │                                  │  gradiente│
│  layer   │                                  │  con glow │
│  cards   │                                  │           │
│          │                                  │           │
│  time    │                                  │           │
│  ctrl    │                                  │           │
├──────────┴──────────────────────────────────┴───────────┤
│  STATUS BAR (28px) — coords, zoom, barrio, timestamp    │
└─────────────────────────────────────────────────────────┘
```

---

## Componentes

### Header
- Prompt: `> ASUNGREEN_v0.1 █` con cursor parpadeante
- Badges sistema: `[SYS:NOMINAL]` `[NASA·MODIS]` `[GEE·READY]`
- Coordenadas actuales: `LAT:-25.2867 LNG:-57.5759`
- Fuente: Press Start 2P 8px para badges, Share Tech Mono para coords

### Sidebar — ASCII terminal panels
```
┌─ 01 · TEMPERATURA ────────────┐
│ ◉ MODIS·MOD11A1·LST           │
│   NASA TERRA · ACTIVE         │
│ ▓▓▓▓▓▓▓░░░ 68% cobertura     │
└───────────────────────────────┘
```
- Numeración de capas: `01`, `02`, `03`
- Estado: `ACTIVE` / `STANDBY` en neon correspondiente
- Toggle: neon glow al activar
- Time slider: solo con tráfico activo, estilo terminal con hora en VT323

### Mapa — vector neon custom
- **Style file**: `/public/styles/asungreen-neon.json`
- **Tiles**: OpenFreeMap (`https://tiles.openfreemap.org/planet`)
- **Colors**:
  - Background: `#030804`
  - Roads major: `#00ff88` (opacity 0.9)
  - Roads minor: `#00ff88` (opacity 0.3)
  - Water: `#00e5ff` (opacity 0.6)
  - Buildings: `#0d2b12` con stroke `#1a4d20`
  - Parks/green: `#0a2e10`
  - Labels: Share Tech Mono, `#a8ffb0`

### Legend
- Gradientes con `box-shadow` neon del color de la capa
- Labels en VT323
- Título en Press Start 2P 7px

### StatusBar (nuevo componente)
- Posición: fixed bottom, full width, 28px
- Contenido: `LAT: -25.2867 | LNG: -57.5759 | ZOOM: 12 | BARRIO: CENTRO | DATA: 2024-08-10`
- Fuente: Share Tech Mono 10px
- Border top: 1px solid `--neon-green` opacity 0.2

---

## Arquitectura de archivos

```
app/
  layout.tsx              → agregar Google Fonts (Press Start 2P, VT323, Share Tech Mono)
  globals.css             → CSS variables neon, scan lines, glow, glitch keyframes

components/
  Header.tsx              → rediseño terminal completo
  Sidebar.tsx             → rediseño ASCII cards
  Legend.tsx              → rediseño neon gradients
  StatusBar.tsx           → nuevo componente
  MapView.tsx             → nuevo basemap, eliminar CartoCDN

public/
  styles/
    asungreen-neon.json   → MapLibre GL style custom completo

lib/
  constants.ts            → NASA WMS URLs (ya migradas), agregar DESIGN_TOKENS
```

---

## Tareas de implementación

| # | Tarea | Archivos |
|---|---|---|
| 1 | Crear `asungreen-neon.json` con estilo MapLibre completo | `public/styles/` |
| 2 | Actualizar `MapView.tsx` para usar el nuevo style JSON | `components/MapView.tsx` |
| 3 | Agregar Google Fonts al layout | `app/layout.tsx` |
| 4 | CSS variables + efectos globales (scan, glow, glitch) | `app/globals.css` |
| 5 | Rediseñar Header | `components/Header.tsx` |
| 6 | Rediseñar Sidebar con ASCII cards | `components/Sidebar.tsx` |
| 7 | Rediseñar Legend con neon glow | `components/Legend.tsx` |
| 8 | Crear StatusBar | `components/StatusBar.tsx` |
| 9 | Integrar StatusBar en MapClient | `components/MapClient.tsx` |

---

## Criterios de éxito del Sub-proyecto 1
- [ ] Consola del browser sin errores de tiles
- [ ] Basemap dark visible con roads neon green y agua cyan
- [ ] NASA GIBS capas NDVI y LST se muestran al activar
- [ ] Tráfico animado funciona con partículas neon
- [ ] Todos los componentes con nuevo diseño neon-terminal
- [ ] Responsive en desktop (1280px+)
- [ ] Deploy limpio en Vercel

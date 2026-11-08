# Slider temporal (2.6) e índices compuestos (3.9)

Estado: 2026-11-08.

## Slider temporal / timelapse

`components/TimeSlider.tsx` (lógica pura en `lib/timelapse.ts`), montado en `MapClient.tsx`.

- **Datos de la zona**: lee `getZonaSerie(zona)` (la zona seleccionada, o `PY` en vista global). Elige el indicador (selector; por defecto LST → NDVI → temp. del aire) y el paso **AÑO / MES** (MES solo si la serie tiene mensual). Los huecos son `null` y se muestran como "Sin dato en este período". Si la zona no tiene series: mensaje claro; si hay capas en vivo, anima solo los años del mapa.
- **Capas en vivo (GEE)**: al mover o reproducir, cambia `years` de `MapClient` a `[año]` (solo en paso anual y entre 2013 y hoy). "Restaurar años" devuelve la selección anterior.
- **Cuota**: `/api/gee-map` admite 20 peticiones sin caché por minuto y cada cambio de `years` pide 2 capas. Por eso el avance automático espera ≥ 7 s por fotograma **y** a que no haya peticiones en curso (`geeStatus.pending` en `lib/geeApi.ts`); al arrastrar a mano hay un debounce de 500 ms; si una petición falla (p. ej. 429) la reproducción se pausa y avisa. Reproducir de nuevo años ya vistos no cuesta cuota (caché del servidor, 6 h).
- **Accesibilidad**: slider nativo (←/→, Home/End, PgUp/PgDn), ←/→ con foco en el panel, botones con `aria-label`/`aria-pressed`, `aria-valuetext` con año y valor, panel plegable; con `prefers-reduced-motion` el avance mínimo es 1,5 s y no hay transiciones.
- **Para el gráfico de la zona**: `useFrame()` (de `lib/timelapse.ts`) devuelve `{ zona, indicador, granularidad, year, month, reproduciendo }`; `year` es `null` hasta que el usuario toca el slider. `SerieChart` puede leerlo para resaltar el año activo (aún no integrado: es un archivo del agente "zonas").

Integraciones tocadas: `components/MapClient.tsx` (1 import + 1 línea), `lib/geeApi.ts` (envoltorio `getGeeTileUrl` que cuenta pendientes/errores en `geeStatus`; la función original pasó a `fetchGeeTileUrl` interna).

## Índices compuestos

`lib/indices.ts` (cálculo puro + carga) y `components/indices/SeccionIndices.tsx`. Se registra en el panel de zona con `components/indices/registro.tsx` (una línea en `components/zona/secciones-externas.ts`). También se puede usar suelto: `<SeccionIndices zonaId="PY-11" />`.

| Índice | Componentes (peso de partida) | Lectura |
|---|---|---|
| **Riesgo de calor** | Calor (LST → LST MODIS → temp. aire ERA5) 35 % · Falta de verde (NDVI invertido) 30 % · Densidad poblacional 20 % · Vulnerabilidad (RWI invertido) 15 % | 100 = mayor riesgo relativo |
| **Índice ambiental urbano** | Vegetación 40 % · Calor superficial (invertido) 30 % · Días ≥ 35 °C (invertido) 30 % | 100 = mejor condición relativa |

Método: cada componente = media de los últimos 3 años anuales con dato (mínimo 2) en una ventana **común** a todas las zonas del nivel; min–max sobre las zonas del **mismo nivel**; pesos editables (sliders), renormalizados a 100 %.

Datos faltantes (nunca se imputa):
- Componente sin datos en el nivel (hoy **población** y **RWI**: no están en el pipeline) o con < 50 % de cobertura → se excluye, se reparten sus pesos y se avisa.
- Zona a la que le falta un componente que las demás sí tienen → puntaje reponderado y marcada **INCOMPLETA**; si queda < 50 % del peso, sin puntaje.
- Si no existe `manifest.json` de series, la sección muestra un estado vacío.

Sensibilidad: posición de la zona con pesos iguales, quitando cada componente y duplicando cada uno, más la correlación de Spearman del orden completo; avisa si el rango de posiciones supera max(3, 10 % de las zonas).

La UI habla de "posición según este modelo", nunca de un ranking oficial. Las limitaciones están siempre visibles.

**Pendiente**: agregar `densidad-poblacion` y `rwi` al pipeline (sus ids ya están como candidatos en `lib/indices.ts`); mostrar la incertidumbre de WorldPop cuando exista.

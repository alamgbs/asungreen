# Panel de zona y modo comparar

- `<PanelZona zonaId onCerrar onComparar/>` (`components/zona/PanelZona.tsx`): KPIs (último año completo, tendencia con p-valor, sparkline, posición entre zonas del mismo nivel), gráfico, franjas de temperatura, fuente y licencia, CSV.
- `<Comparar ids onChange onCerrar/>`: 2–3 zonas con el mismo eje. URL: `?comparar=a,b,c` (acepta ids antiguos); con el modo abierto, un clic en el mapa agrega la zona.
- Series: `/series/{zona}.json` (ver `docs/pipeline.md`). Sin `manifest.json` se pide el archivo directo; zonas o indicadores sin datos muestran un estado vacío, nunca ceros.
- Tendencia: mínimos cuadrados sobre años completos, p-valor con t de Student (no corrige autocorrelación); con < 10 años se declara insuficiente.
- **Agregar una sección:** `registrarSeccion({ id, titulo, orden, Componente })` desde `components/zona/secciones.ts` y una línea `import` en `secciones-externas.ts`. Órdenes: 10 KPIs, 20 gráfico, 30 franjas, 40–80 libres, 90 fuente.
- Leyenda (2.7): rango y paleta fijos de `lib/indicadores.ts`. «Estirar a la zona» no está implementado (requiere re-estilizar los tiles en la API).
- Gráficos en SVG propio: sin dependencias nuevas.

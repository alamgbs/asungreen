// Cotejo de los distritos de geoBoundaries (2012) con la lista de municipios de Wikipedia
// ("Anexo:Municipios de Paraguay"). Wikipedia es una fuente SECUNDARIA: sirve para detectar
// diferencias, no para fijar la verdad. La lista oficial vigente es de DGEEC/INE.
// Salida: data/zonas/reconciliacion.json (campo "cotejo_wikipedia").
import { readFile, writeFile } from 'node:fs/promises';

const wiki = JSON.parse(await readFile('data/zonas/raw/wiki-municipios.json', 'utf8')).parse.wikitext;
const zonas = JSON.parse(await readFile('data/zonas/zonas.json', 'utf8')).zonas;
const ABR = { dr: 'doctor', dra: 'doctor', gral: 'general', cnel: 'coronel', tte: 'teniente', cap: 'capitan', mcal: 'mariscal', sgto: 'sargento' };
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ñ/g, 'n')
  .replace(/\(paraguay\)/g, ' ').replace(/^departamento\s+(de\s+)?/, '')
  .replace(/\b(de|del|la|las|los|y|el)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ')
  .split(' ').filter(Boolean).map((w) => ABR[w] ?? w).join(' ');
// Distancia de edición normalizada para emparejar variantes ortográficas (Yasy Cañy / Yasy Kañy).
const sim = (a, b) => { const m = a.length, n = b.length; if (!m || !n) return 0;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]); for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i-1][j] + 1, d[i][j-1] + 1, d[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1));
  return 1 - d[m][n] / Math.max(m, n); };


// Equivalencias de nombre emparejadas a mano (geoBoundaries abrevia o escribe distinto).
// Son la misma jurisdicción por el nombre y el departamento; no se verificó contra DGEEC.
const EQUIV = {
  'Carmelo Peralta': 'Capitán Carmelo Peralta', 'Juan E. O´leary': "Juan Emiliano O'Leary",
  'Mariscal Estigarribia': 'Mariscal José Félix Estigarribia', '3 de Febrero': 'Tres de Febrero',
  'Cecilio Baez': 'Doctor Cecilio Báez', 'J Eulogio Estigarribia': 'Doctor Juan Eulogio Estigarribia',
  'R.i. 3 Corrales': 'Regimiento de Infantería Tres Corrales', '3 de Mayo': 'Tres de Mayo',
  'Moises Bertoni': 'Doctor Moisés Santiago Bertoni', 'Francisco Caballero Alvarez': 'General Francisco Caballero Álvarez',
  'La Paloma': 'La Paloma del Espíritu Santo', 'J Augusto Saldivar': 'Julián Augusto Saldívar',
  'San Carlos': 'San Carlos del Apa', 'Yvy Ya´u': 'Yby Yaú', 'Colonia Independencia': 'Independencia',
  'General Eugenio A. Garay': 'General Eugenio Alejandrino Garay', 'Mauricio Jose Troche': 'Capitán Mauricio José Troche',
  'Mbocayaty': 'Mbocayaty del Guairá', 'Yataity': 'Yataity del Guairá', 'Coronel Bogado': 'Coronel José Félix Bogado',
  'Jesus': 'Jesús de Tavarangüé', 'Leandro Oviedo': 'José Leandro Oviedo', 'Mayor Otaño': 'Mayor Julio Dionisio Otaño',
  'San Juan Delparana': 'San Juan del Paraná', 'San Ignacio': 'San Ignacio Guazú', 'Santa Maria': 'Santa María de Fe',
  'Santa Rosa': 'Santa Rosa de Lima', 'General Diaz': 'General José Eduvigis Díaz', 'Mayor Martinez': 'Mayor José Martínez',
  'San Roque Gonzalez': 'San Roque González de Santa Cruz', 'Yvytimi': 'Ybytymí', '25 de Diciembre': 'Veinticinco de Diciembre',
  'General Resquin': 'General Isidoro Resquín', 'Guajayvi': 'Guayaibí', 'Yryvu Cua': 'Yrybucuá',
};
const EQUIV_AMAMBAY = { 'Bella Vista': 'Bella Vista Norte' }; // solo en Amambay (hay otra Bella Vista en Itapúa)

const start = wiki.indexOf('== Municipios por departamento ==');
const body = wiki.slice(start);
const lines = body.split('\n');
const wikiPorDepto = {}; let depto = null;
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  const h = l.match(/colspan="5".*?'''\[\[([^\]|]+)(?:\|[^\]]*)?\]\]'''/);
  if (h) { depto = h[1]; wikiPorDepto[depto] = { declarados: Number((lines[i].match(/''(\d+) municipios''/) ?? [])[1] ?? NaN), nombres: [] }; continue; }
  const m = l.match(/^\| align="center" \| '''\[\[([^\]|]+)(?:\|([^\]]*))?\]\]'''/);
  if (m && depto) wikiPorDepto[depto].nombres.push(m[2] ?? m[1]);
}
const deptoId = Object.fromEntries(zonas.filter((z) => z.nivel === 'departamento').map((z) => [norm(z.nombre), z.id]));
const pendientes = [];
const slug = (x) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/ñ/g, 'n').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const res = { fuente: 'es.wikipedia.org Anexo:Municipios de Paraguay (secundaria; 263 municipios según su texto)', departamentos: {}, solo_en_wikipedia: [], solo_en_geoboundaries: [] };
let totalWiki = 0;
for (const [dep, v] of Object.entries(wikiPorDepto)) {
  const id = deptoId[norm(dep)] ?? (norm(dep).includes('asuncion') ? 'PY-ASU' : null);
  totalWiki += v.nombres.length;
  const gb = zonas.filter((z) => z.nivel === 'distrito' && z.padre === id);
  const gbN = new Map(gb.map((z) => {
    const alias = (id === 'PY-13' && EQUIV_AMAMBAY[z.nombre]) || EQUIV[z.nombre];
    return [norm(alias ?? z.nombre), z];
  }));
  const wN = new Map(v.nombres.map((n) => [norm(n), n]));
  let faltanK = [...wN.keys()].filter((k) => !gbN.has(k));
  let sobranK = [...gbN.keys()].filter((k) => !wN.has(k));
  const empar = [];
  for (const k of [...faltanK]) { // emparejado difuso 1 a 1 (similitud ≥ 0,8)
    let best = null, bs = 0.8;
    for (const g of sobranK) { const v = sim(k, g); if (v >= bs) { bs = v; best = g; } }
    if (best) { empar.push([wN.get(k), gbN.get(best).nombre]); faltanK = faltanK.filter((x) => x !== k); sobranK = sobranK.filter((x) => x !== best); }
  }
  const faltan = faltanK.map((k) => wN.get(k));
  const sobran = sobranK.map((k) => gbN.get(k).nombre);
  res.departamentos[dep] = { id, wikipedia_declarados: v.declarados, wikipedia_listados: v.nombres.length, geoboundaries: gb.length, emparejados_por_ortografia: empar, faltan_en_geoboundaries: faltan, sin_par_en_wikipedia: sobran };
  res.solo_en_wikipedia.push(...faltan.map((n) => `${dep}: ${n}`));
  pendientes.push(...faltan.map((n) => ({ id: `${id}-${slug(n)}`, nivel: 'distrito', nombre: n, padre: id, estado: 'pendiente',
    motivo: 'Aparece en Wikipedia (fuente secundaria) pero no en geoBoundaries 2012; sin geometría fiable. No se inventó el límite.',
    bbox: null, centroide: null, area_km2: null })));
  res.solo_en_geoboundaries.push(...sobran.map((n) => `${dep}: ${n}`));
}
res.total_wikipedia_listados = totalWiki;
res.total_geoboundaries = zonas.filter((z) => z.nivel === 'distrito').length;
const zj = JSON.parse(await readFile('data/zonas/zonas.json', 'utf8'));
zj.pendientes = pendientes;
await writeFile('data/zonas/zonas.json', JSON.stringify(zj, null, 1));
const rec = JSON.parse(await readFile('data/zonas/reconciliacion.json', 'utf8'));
rec.cotejo_wikipedia = res;
await writeFile('data/zonas/reconciliacion.json', JSON.stringify(rec, null, 2));
console.log(JSON.stringify({ wiki: totalWiki, gb: res.total_geoboundaries, faltan: res.solo_en_wikipedia.length, sobran: res.solo_en_geoboundaries.length }));
console.log('FALTAN (en Wikipedia, no en geoBoundaries):', res.solo_en_wikipedia.join(' | '));
console.log('SIN PAR (geoBoundaries):', res.solo_en_geoboundaries.join(' | '));

// ── Informe legible ──
const r = rec.cotejo_wikipedia;
const md = `# Reconciliación de distritos

Generado por \`scripts/zonas/reconciliar-distritos.mjs\` (${rec.generado}). **No es una validación oficial**: se compara
geoBoundaries (año representado 2012, fuente DGEEC) con una fuente secundaria (Wikipedia, "Anexo:Municipios de Paraguay").
La lista oficial vigente es de DGEEC/INE y **no se pudo consultar** desde este entorno.

- Distritos en geoBoundaries: **${r.total_geoboundaries}** (incluye el distrito Asunción, duplicado del departamento Capital: \`duplicaDe: PY-ASU\`).
- Municipios listados por Wikipedia: **${r.total_wikipedia_listados}** (su texto dice 263 = 262 + Distrito Capital).
- Artefactos en geoBoundaries: **${rec.poligonos_diminutos_omitidos.length}** polígonos de 0,2 km² (${rec.poligonos_diminutos_omitidos.join(', ')}) con nombre repetido dentro de San Juan del Paraná; se marcan \`omitirSeries: true\`. Descontándolos, los distritos reales con geometría son ${r.total_geoboundaries - rec.poligonos_diminutos_omitidos.length}, y ${r.total_geoboundaries - rec.poligonos_diminutos_omitidos.length} + ${r.solo_en_wikipedia.length} = ${r.total_geoboundaries - rec.poligonos_diminutos_omitidos.length + r.solo_en_wikipedia.length}, que coincide con los ${r.total_wikipedia_listados} de Wikipedia.
- La propia página de Wikipedia es inconsistente en Concepción (declara 13 municipios y lista 14); tratar esos pendientes con cautela.
- Equivalencias de nombre emparejadas a mano (abreviaturas/ortografía): ver \`EQUIV\` en el script.
- Sin geometría en geoBoundaries (**${r.solo_en_wikipedia.length}**), marcados \`estado: "pendiente"\` en \`zonas.json > pendientes\`, **sin inventar límites**:

${r.solo_en_wikipedia.map((x) => `  - ${x.replace('Departamento de ', '').replace('Departamento ', '')}`).join('\n')}

## Cómo cerrar la brecha
1. Obtener el listado y los límites vigentes de DGEEC/INE (o el servicio geo.stp.gov.py citado por geoBoundaries) y comprobar cada pendiente.
2. Si existe geometría fiable (OSM/HDX), añadirla como fuente adicional en \`build-zonas.mjs\` y registrar su licencia.
3. Los distritos pendientes **no tienen series**: el pipeline y la UI deben tratarlos como "sin datos", no como cero.
4. Los vecinos de un distrito nuevo (segregado de otro) pueden tener un área mayor que la actual: sus series de antes de la segregación siguen siendo válidas para el territorio de 2012.
`;
await writeFile('data/zonas/reconciliacion.md', md);

// Descarga límites de geoBoundaries (gbOpen) a data/zonas/raw/ y registra metadatos.
// Idempotente: si el archivo ya existe y --force no está, lo reutiliza.
// Uso: node scripts/zonas/fetch-boundaries.mjs [--force]
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const RAW = path.resolve('data/zonas/raw');
const force = process.argv.includes('--force');
const exists = (p) => access(p).then(() => true, () => false);

// Solo Paraguay viene de geoBoundaries; las ciudades extranjeras vienen de OSM
// (scripts/zonas/fetch-osm-cities.mjs). Ver docs/zonas.md para el porqué.
const JOBS = [
  { iso: 'PRY', adm: 'ADM0' }, { iso: 'PRY', adm: 'ADM1' }, { iso: 'PRY', adm: 'ADM2' },
];

const meta = {};
await mkdir(RAW, { recursive: true });
for (const { iso, adm } of JOBS) {
  const file = path.join(RAW, `${iso}-${adm}.geojson`);
  const info = await (await fetch(`https://www.geoboundaries.org/api/current/gbOpen/${iso}/${adm}/`)).json();
  if (!info.gjDownloadURL) { console.warn(`${iso} ${adm}: sin gjDownloadURL`); continue; }
  let buf;
  if (!force && await exists(file)) {
    console.log(`= ${iso}-${adm} (ya existe)`);
    buf = await readFile(file);
  } else {
    console.log(`↓ ${iso}-${adm}`);
    const r = await fetch(info.gjDownloadURL);
    if (!r.ok) { console.warn(`  HTTP ${r.status}`); continue; }
    buf = Buffer.from(await r.arrayBuffer());
    await writeFile(file, buf);
  }
  meta[`${iso}-${adm}`] = {
    boundaryID: info.boundaryID, yearRepresented: info.boundaryYearRepresented,
    source: info.boundarySource, license: info.boundaryLicense,
    sourceURL: info.boundarySourceURL, buildDate: info.buildDate,
    admUnitCount: Number(info.admUnitCount), gjDownloadURL: info.gjDownloadURL,
    sha256: buf ? createHash('sha256').update(buf).digest('hex') : undefined,
  };
}
await writeFile(path.join(RAW, 'metadata.json'), JSON.stringify(meta, null, 2));
console.log('metadata.json escrito');

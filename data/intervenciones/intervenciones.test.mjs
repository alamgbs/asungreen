// node --test data/intervenciones/intervenciones.test.mjs
// Pruebas de lib/intervenciones.ts (Node >= 22.18 carga .ts directamente).
// Las series de abajo son SINTÉTICAS y sirven solo para probar las funciones.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validarIntervencion, contrasteAntesDespues, enVentana, promediarZonas, difMedias, pendiente,
} from '../../lib/intervenciones.ts';

const dir = path.dirname(fileURLToPath(import.meta.url));
const zonas = JSON.parse(fs.readFileSync(path.join(dir, '../zonas/zonas.json'), 'utf8'));
const ids = new Set((Array.isArray(zonas) ? zonas : zonas.zonas).map((z) => z.id));

test('todas las historias del repositorio validan', () => {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
  assert.ok(files.length >= 6);
  for (const f of files) {
    const r = validarIntervencion(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), { zonaIdsValidos: ids });
    assert.deepEqual(r.errores, [], f);
  }
});

test('el validador rechaza lenguaje causal y verificada sin respaldo de fecha', () => {
  const base = JSON.parse(fs.readFileSync(path.join(dir, 'bishan-ang-mo-kio-2012.json'), 'utf8'));
  const malo = { ...base, resumen: 'El parque causó una baja de temperatura.' };
  assert.ok(validarIntervencion(malo).errores.some((e) => e.includes('lenguaje causal')));
  const sinFecha = { ...base, fuentes: base.fuentes.map((f) => ({ ...f, respalda: ['ubicacion'] })) };
  assert.ok(validarIntervencion(sinFecha).errores.some((e) => e.includes('respalda la fecha')));
  const solapa = { ...base, ventanaExcluida: { inicio: '2007-01', fin: '2012-12' } };
  assert.ok(validarIntervencion(solapa).errores.some((e) => e.includes('ventanaExcluida')));
});

test('enVentana: año completo dentro de la ventana', () => {
  const w = { inicio: '2004-01', fin: '2006-12' };
  assert.equal(enVentana('2004', w), true);
  assert.equal(enVentana('2007', w), false);
  assert.equal(enVentana('2006-12', w), true);
  assert.equal(enVentana('2003-12', w), false);
  assert.equal(enVentana('2004', { inicio: '2004-02', fin: '2006-12' }), false);
});

test('DiD con efecto conocido y ruido: recupera +1 y su IC lo contiene', () => {
  const years = Array.from({ length: 14 }, (_, i) => String(2000 + i));
  const ruido = [0.05, -0.04, 0.03, -0.02, 0.04, -0.05, 0.02, -0.03, 0.01, 0.04, -0.02, 0.03, -0.01, 0.02];
  const ctl = years.map((t, i) => ({ t, v: 10 + 0.1 * i + ruido[i] }));
  // tratada = control + 1 a partir de 2007 (la ventana "después" empieza ahí)
  const tra = years.map((t, i) => ({ t, v: 10 + 0.1 * i + ruido[(i + 5) % 14] * 0.5 + (i >= 7 ? 1 : 0) }));
  const { resultado: r } = contrasteAntesDespues('x', tra, ctl, {
    antes: { inicio: '2000-01', fin: '2003-12' }, excluida: { inicio: '2004-01', fin: '2006-12' }, despues: { inicio: '2007-01', fin: '2013-12' },
  });
  assert.ok(r);
  assert.equal(r.nAntes, 4);
  assert.equal(r.nDespues, 7);
  assert.ok(Math.abs(r.did - 1) < 0.1, `did=${r.did}`);
  assert.ok(r.didIc95[0] < 1 && r.didIc95[1] > 1);
  assert.equal(r.indistinguibleDeCero, false);
});

test('sin datos suficientes devuelve null con motivo; nunca rellena', () => {
  const s = [{ t: '2001', v: 1 }, { t: '2002', v: null }, { t: '2003', v: 1.2 }, { t: '2008', v: 2 }];
  const { resultado, motivo } = contrasteAntesDespues('x', s, null, {
    antes: { inicio: '2000-01', fin: '2003-12' }, despues: { inicio: '2007-01', fin: '2013-12' },
  });
  assert.equal(resultado, null);
  assert.match(motivo, /insuficientes/);
});

test('sin control: cambio observado y advertencia, did = null', () => {
  const s = [1, 1.1, 0.9, 5, 5.1, 4.9].map((v, i) => ({ t: String(2000 + i), v }));
  const { resultado: r } = contrasteAntesDespues('x', s, null, {
    antes: { inicio: '2000-01', fin: '2002-12' }, despues: { inicio: '2003-01', fin: '2005-12' },
  });
  assert.equal(r.did, null);
  assert.ok(Math.abs(r.tratada.diferencia - 4) < 1e-9);
  assert.ok(r.advertencias.some((a) => a.includes('Sin grupo de control')));
});

test('tendencias previas no paralelas se marcan', () => {
  const years = Array.from({ length: 10 }, (_, i) => String(2000 + i));
  const ctl = years.map((t) => ({ t, v: 5 }));
  const tra = years.map((t, i) => ({ t, v: 5 + (i < 5 ? 0.5 * i : 2.5 + 0.1 * (i - 5)) + (i % 2 ? 0.01 : -0.01) }));
  const { resultado: r } = contrasteAntesDespues('x', tra, ctl, {
    antes: { inicio: '2000-01', fin: '2004-12' }, despues: { inicio: '2005-01', fin: '2009-12' },
  });
  assert.equal(r.pretendencia.paralela, false);
});

test('promediarZonas exige todas las zonas; pendiente y Welch básicos', () => {
  const a = [{ t: '2000', v: 1 }, { t: '2001', v: 3 }];
  const b = [{ t: '2000', v: 3 }, { t: '2001', v: null }];
  assert.deepEqual(promediarZonas([a, b]), [{ t: '2000', v: 2 }, { t: '2001', v: null }]);
  const p = pendiente([0, 1, 2, 3], [1, 3, 5, 7]);
  assert.ok(Math.abs(p.b - 2) < 1e-9);
  const w = difMedias([1, 2, 3], [11, 12, 13]);
  assert.equal(w.dif, 10);
  assert.ok(w.ic95[0] > 0);
});

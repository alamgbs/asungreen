// Cliente mínimo de la REST API de Earth Engine (v1) para el pipeline.
// JWT de cuenta de servicio (GEE_SA_JSON), token cacheado ~50 min, concurrencia ≤12 (la cuota es
// 40 concurrentes por proyecto; el resto queda para la app), reintentos con backoff ante 429/5xx.
import { createSign } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { sleep } from '../lib/http.mjs';

export const GEE_V1 = 'https://earthengine.googleapis.com/v1';
const MAX_CONC = 12;

export function cargarCuenta() {
  if (process.env.GEE_SA_JSON) return JSON.parse(process.env.GEE_SA_JSON);
  if (existsSync('service-account.json')) return JSON.parse(readFileSync('service-account.json', 'utf8'));
  throw new Error('Falta GEE_SA_JSON (o service-account.json local, que nunca se commitea).');
}

const b64 = (s) => Buffer.from(s).toString('base64url');
let tok = null;
export async function token(sa) {
  if (tok && tok.exp > Date.now()) return tok.v;
  const now = Math.floor(Date.now() / 1000);
  const u = `${b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/earthengine',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }))}`;
  const sig = createSign('RSA-SHA256').update(u).sign(sa.private_key).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${u}.${sig}` }) });
  const j = await r.json();
  if (!j.access_token) throw new Error(`OAuth2 falló: ${j.error}`);
  tok = { v: j.access_token, exp: Date.now() + 50 * 60 * 1000 };
  return tok.v;
}

// Semáforo simple
let activos = 0; const cola = [];
async function adquirir() { if (activos < MAX_CONC) { activos++; return; } await new Promise((r) => cola.push(r)); }
function liberar() { const n = cola.shift(); if (n) n(); else activos--; }

export const stats = { llamadas: 0, reintentos429: 0, ms: 0 };

/** POST con semáforo y backoff. Devuelve { ok, status, json, texto, ms }. */
export async function post(sa, path, body, { reintentos = 5 } = {}) {
  await adquirir();
  try {
    for (let i = 0; ; i++) {
      const t0 = performance.now();
      const res = await fetch(`${GEE_V1}/projects/${sa.project_id}/${path}`, {
        method: 'POST', body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token(sa)}` },
      });
      const texto = await res.text(); const ms = performance.now() - t0;
      stats.llamadas++; stats.ms += ms;
      if ((res.status === 429 || res.status >= 500) && i < reintentos) {
        if (res.status === 429) stats.reintentos429++;
        await sleep(2000 * 2 ** i + Math.random() * 500); continue;
      }
      let json = null; try { json = JSON.parse(texto); } catch { /* no JSON */ }
      return { ok: res.ok, status: res.status, json, texto, ms };
    }
  } finally { liberar(); }
}

export async function compute(sa, expression) {
  const r = await post(sa, 'value:compute', { expression });
  if (!r.ok) throw new Error(`value:compute ${r.status}: ${r.texto.slice(0, 400)}`);
  return r;
}

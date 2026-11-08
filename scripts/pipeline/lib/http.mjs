export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** fetch JSON con reintentos y backoff exponencial (errores de red y 5xx). */
export async function getJson(url, { reintentos = 4, timeoutMs = 120000, okStatus = [] } = {}) {
  let ultimo;
  for (let i = 0; i <= reintentos; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      const texto = await res.text();
      let json = null;
      try { json = JSON.parse(texto); } catch { /* cuerpo no JSON */ }
      if (res.ok || okStatus.includes(res.status)) return { res, json, texto };
      if (res.status === 429 || (res.status >= 400 && res.status < 500)) return { res, json, texto };
      ultimo = new Error(`HTTP ${res.status}: ${texto.slice(0, 150)}`);
    } catch (e) { ultimo = e; }
    await sleep(1500 * 2 ** i);
  }
  throw ultimo;
}

// Genera un PDF mínimo válido (1 página, texto Helvetica) sin dependencias.
// Uso: node scripts/make-example-pdf.mjs <salida.pdf> "<línea 1>" ["<línea 2>" ...]
import fs from 'node:fs';

export function buildPdf(lines) {
  const esc = (s) => s.replace(/[\\()]/g, '\\$&').replace(/[^\x20-\x7e]/g, '?');
  const text = ['BT', '/F1 20 Tf', '72 720 Td', '26 TL', ...lines.map((l) => `(${esc(l)}) Tj T*`), 'ET'].join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => { out += `${String(o).padStart(10, '0')} 00000 n \n`; });
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

if (process.argv[1] && process.argv[1].endsWith('make-example-pdf.mjs')) {
  const [out, ...lines] = process.argv.slice(2);
  if (!out || !lines.length) { console.error('Uso: node scripts/make-example-pdf.mjs <salida.pdf> "<línea>" ...'); process.exit(1); }
  fs.writeFileSync(out, buildPdf(lines));
  console.log(`PDF generado: ${out}`);
}

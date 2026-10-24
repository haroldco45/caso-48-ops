// Robot de noticias del Caso 48 OPS
// Lo corre GitHub Actions cada 30 minutos. Busca en Google News (RSS) y GDELT,
// se queda solo con notas del caso y las une con las que ya hay en data/noticias.json.
import { readFile, writeFile } from 'node:fs/promises';

const ARCHIVO = 'data/noticias.json';
const CONSULTAS = [
  '"48 mujeres" Petro',
  'Dapre "48 mujeres"',
  'Carlos Ríos Dapre OPS denuncia',
  '"48 mujeres" Fiscalía Dapre'
];
const MAX = 120;

const relevante = t => /48 mujeres|instrumentaliz|\bops\b/i.test(t) && /petro|dapre|r[ií]os/i.test(t);
const limpiar = s => String(s || '')
  .replace(/<!\[CDATA\[|\]\]>/g, '')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .trim();

async function googleNews(q) {
  const url = 'https://news.google.com/rss/search?hl=es-419&gl=CO&ceid=CO:es-419&q=' + encodeURIComponent(q + ' when:14d');
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (VibrasPositivasHM robot)' } });
  if (!r.ok) throw new Error('Google News ' + r.status);
  const xml = await r.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => {
    const it = m[1];
    const tag = n => limpiar((it.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`)) || [])[1]);
    let titulo = tag('title');
    const fuente = tag('source');
    if (fuente && titulo.endsWith(' - ' + fuente)) titulo = titulo.slice(0, -(fuente.length + 3));
    return { titulo, url: tag('link'), fuente: fuente || 'Google Noticias', fecha: new Date(tag('pubDate') || Date.now()).toISOString() };
  });
}

async function gdelt(q) {
  const url = 'https://api.gdeltproject.org/api/v2/doc/doc?format=json&mode=artlist&maxrecords=50&sort=datedesc&timespan=14d&query='
    + encodeURIComponent(`(${q}) sourcelang:spanish`);
  const r = await fetch(url);
  if (!r.ok) throw new Error('GDELT ' + r.status);
  const j = await r.json().catch(() => ({}));
  return (j.articles || []).map(a => ({
    titulo: a.title, url: a.url, fuente: a.domain,
    fecha: a.seendate ? a.seendate.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/, '$1-$2-$3T$4:$5:$6Z') : new Date().toISOString()
  }));
}

let actual = { noticias: [] };
try { actual = JSON.parse(await readFile(ARCHIVO, 'utf8')); } catch {}

const nuevas = [];
for (const q of CONSULTAS) {
  for (const fuente of [googleNews, gdelt]) {
    try { nuevas.push(...await fuente(q)); }
    catch (e) { console.log('Aviso:', e.message); }
  }
}

const clave = n => (n.titulo || '').toLowerCase().replace(/[^a-záéíóúñ0-9 ]/g, '').slice(0, 60);
const vistos = new Map();
for (const n of [...(actual.noticias || []), ...nuevas]) {
  if (!n.titulo || !n.url || !relevante(n.titulo)) continue;
  const k = clave(n);
  if (!vistos.has(k)) vistos.set(k, n);
}
const noticias = [...vistos.values()].sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, MAX);

await writeFile(ARCHIVO, JSON.stringify({ actualizado: new Date().toISOString(), noticias }, null, 2) + '\n');
console.log(`Listo: ${noticias.length} noticias (${nuevas.length} revisadas en esta vuelta).`);

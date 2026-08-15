import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { request } from 'node:https';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const dataset = JSON.parse(readFileSync(ROOT + 'data/dsp-data.json', 'utf8'));

function api(params) {
  const qs = new URLSearchParams({ format: 'json', ...params }).toString();
  return new Promise((resolve, reject) => {
    const req = request(`https://dsp-wiki.com/api.php?${qs}`, { headers: { 'User-Agent': 'dsp-calculator-research/1.0' } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('timeout')));
    req.end();
  });
}

function download(url) {
  return new Promise((resolve, reject) => {
    const req = request(url, { headers: { 'User-Agent': 'dsp-calculator-research/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400) {
        res.resume();
        resolve({ status: res.statusCode, loc: res.headers.location, buf: null });
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, loc: null, buf: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('timeout')));
    req.end();
  });
}

// Icon file naming: try "Icon_<Name>.png" with spaces -> underscores
function iconFileName(name) {
  return 'Icon_' + name.replace(/ /g, '_') + '.png';
}

const names = dataset.items.map((i) => i.name);
const titles = names.map((n) => 'File:' + iconFileName(n)).join('|');

// Query imageinfo in chunks of 40
const out = new Map(); // name -> url or 'MISSING'
for (let i = 0; i < titles.split('|').length; i += 40) {
  const chunk = titles.split('|').slice(i, i + 40).join('|');
  const r = await api({ action: 'query', titles: chunk, prop: 'imageinfo', iiprop: 'url' });
  for (const p of Object.values(r.query.pages)) {
    const fileTitle = p.title;
    const name = fileTitle.slice('File:Icon_'.length, -'.png'.length).replace(/_/g, ' ');
    if (p.imageinfo && p.imageinfo[0]) out.set(name, p.imageinfo[0].url);
    else out.set(name, null);
  }
}

const iconDir = ROOT + 'web/icons/';
mkdirSync(iconDir, { recursive: true });
let ok = 0, missing = [];
for (const name of names) {
  const url = out.get(name);
  if (!url) { missing.push(name); continue; }
  const fn = iconDir + name.replace(/[^A-Za-z0-9.()\-]/g, '_') + '.png';
  try {
    const d = await download(url);
    if (d.buf && d.buf.length > 100) { writeFileSync(fn, d.buf); ok++; }
    else missing.push(name + '(empty)');
  } catch (e) { missing.push(name + '(err)'); }
  await new Promise((r) => setTimeout(r, 120));
}
console.log(`downloaded ${ok}/${names.length} icons`);
console.log('missing:', JSON.stringify(missing));

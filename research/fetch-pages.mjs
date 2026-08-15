// Fetch raw wikitext pages from dsp-wiki.com for research
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { request } from 'node:https';

const OUT = fileURLToPath(new URL('./raw/', import.meta.url));
mkdirSync(OUT, { recursive: true });

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const req = request(url, { headers: { 'User-Agent': 'dsp-calculator-research/1.0 (contact: local dev)' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400) {
        res.resume();
        resolve({ status: res.statusCode, location: res.headers.location, body: null });
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, location: null, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(new Error('timeout')); });
    req.end();
  });
}

const pages = [
  'Module:GameData',
  'Modding:Recipe_IDs',
  'Items',
  'Buildings',
  'Components',
  'Natural_Resources',
  'Main_Page',
];

for (const p of pages) {
  const url = `https://dsp-wiki.com/${encodeURIComponent(p)}?action=raw`;
  try {
    const r = await fetchUrl(url);
    if (r.body != null) {
      const fn = p.replace(/[\/:]/g, '_') + '.txt';
      writeFileSync(OUT + fn, r.body);
      console.log(`OK  ${p}  status=${r.status}  len=${r.body.length} -> ${fn}`);
    } else {
      console.log(`REDIRECT ${p} -> ${r.location}`);
      if (r.location) {
        const r2 = await fetchUrl('https://dsp-wiki.com' + r.location + (r.location.includes('?') ? '&' : '?') + 'action=raw');
        const fn = p.replace(/[\/:]/g, '_') + '.txt';
        writeFileSync(OUT + fn, r2.body ?? '');
        console.log(`  then OK ${p} len=${r2.body?.length}`);
      }
    }
  } catch (e) {
    console.log(`FAIL ${p}: ${e.message}`);
  }
}

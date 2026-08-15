// Query dsp-wiki.com MediaWiki API to enumerate data modules and check structure
import { writeFileSync } from 'node:fs';
import { request } from 'node:https';

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

// 1. All modules starting with "Module:"
const mods = await api({ action: 'query', list: 'allpages', apprefix: 'Module:', aplimit: '500', apnamespace: '828' });
console.log('=== Modules ===');
for (const p of mods.query.allpages) console.log(p.title);

// 2. All pages starting with "Module:GameData"
const gd = await api({ action: 'query', list: 'allpages', apprefix: 'GameData', aplimit: '500', apnamespace: '828' });
console.log('=== GameData subpages ===');
for (const p of gd.query.allpages) console.log(p.title);

// 3. Categories
const cats = await api({ action: 'query', list: 'allcategories', aclimit: '200' });
console.log('=== Top categories ===');
for (const c of cats.query.allcategories) console.log(c['*']);

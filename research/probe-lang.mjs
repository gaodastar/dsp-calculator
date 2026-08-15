import { request } from 'node:https';

function apiGet(host, params) {
  const qs = new URLSearchParams({ format: 'json', ...params }).toString();
  return new Promise((resolve, reject) => {
    const req = request(`https://${host}${qs}`, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400) {
        res.resume();
        reject(new Error(`redirect ${res.statusCode} to ${res.headers.location}`));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch (e) { reject(new Error(`JSON parse fail: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('timeout')));
    req.end();
  });
}

// all pages starting with 物品 (items)
const pages = await apiGet('wiki.biligame.com/dsp/api.php?', { action: 'query', list: 'allpages', apprefix: '物品', aplimit: 500 });
console.log('=== 物品 pages ===');
for (const r of pages.query.allpages) console.log(r.title);

// search for item data templates
const tpl = await apiGet('wiki.biligame.com/dsp/api.php?', { action: 'query', list: 'allpages', apnamespace: 10, aplimit: 500 });
console.log('=== templates ===');
for (const r of tpl.query.allpages) console.log(r.title);

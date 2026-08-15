import { writeFileSync } from 'node:fs';
import { request } from 'node:https';

const pages = ['Ray Receiver', 'Critical Photon', 'Crude Oil', 'Artificial Star', 'Antimatter Fuel Rod',
  'Thermal Power Plant', 'Mini Fusion Power Plant', 'Accumulator'];

function fetch(url) {
  return new Promise((resolve, reject) => {
    const req = request(url, { headers: { 'User-Agent': 'dsp-calculator-research/1.0' } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('timeout')));
    req.end();
  });
}

for (const p of pages) {
  const r = await fetch(`https://dsp-wiki.com/${encodeURIComponent(p)}?action=raw`);
  writeFileSync('research/raw/page_' + p.replace(/[^A-Za-z0-9]/g, '_') + '.txt', r.body);
  console.log(`${p}: ${r.body.length} bytes`);
}

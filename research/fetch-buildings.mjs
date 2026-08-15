import { mkdirSync, writeFileSync } from 'node:fs';
import { request } from 'node:https';

const pages = ['Arc Smelter', 'Plane Smelter', 'Negentropy Smelter', 'Assembling Machine Mk.I',
  'Assembling Machine Mk.II', 'Assembling Machine Mk.III', 'Re-composing Assembler',
  'Chemical Plant', 'Quantum Chemical Plant', 'Oil Refinery', 'Miniature Particle Collider',
  'Matrix Lab', 'Self-evolution Lab', 'Fractionator', 'Mining Machine', 'Advanced Mining Machine',
  'Water Pump', 'Oil Extractor', 'Orbital Collector', 'Proliferator Mk.I', 'Proliferator Mk.III'];

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
  const fn = 'research/raw/building_' + p.replace(/[^A-Za-z0-9]/g, '_') + '.txt';
  writeFileSync(fn, r.body);
  console.log(`${p}: ${r.body.length} bytes`);
}

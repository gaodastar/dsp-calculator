import { writeFileSync } from 'node:fs';
import { request } from 'node:https';

const pages = ['Arc Smelter/ItemInfo', 'Plane Smelter/ItemInfo', 'Negentropy Smelter/ItemInfo',
  'Assembling Machine Mk.I/ItemInfo', 'Assembling Machine Mk.II/ItemInfo', 'Assembling Machine Mk.III/ItemInfo',
  'Re-composing Assembler/ItemInfo', 'Chemical Plant/ItemInfo', 'Quantum Chemical Plant/ItemInfo',
  'Oil Refinery/ItemInfo', 'Miniature Particle Collider/ItemInfo', 'Matrix Lab/ItemInfo',
  'Self-evolution Lab/ItemInfo', 'Fractionator/ItemInfo', 'Mining Machine/ItemInfo',
  'Advanced Mining Machine/ItemInfo', 'Water Pump/ItemInfo', 'Oil Extractor/ItemInfo',
  'Orbital Collector/ItemInfo', 'Ray Receiver/ItemInfo', 'Energy Exchanger/ItemInfo'];

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
  const fn = 'research/raw/info_' + p.replace(/[^A-Za-z0-9]/g, '_') + '.txt';
  writeFileSync(fn, r.body);
  console.log(`${p}: ${r.body.length} bytes`);
}

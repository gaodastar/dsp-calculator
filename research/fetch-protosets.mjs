// Download the game-data protosets JSON from dsp-wiki.com.
// Saves to research/raw/protosets.json (gitignored snapshot).
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { request } from 'node:https';

const RAW = fileURLToPath(new URL('./raw/', import.meta.url));
const URL = 'https://dsp-wiki.com/Module:GameData/protosets.json?action=raw';

export function fetchProtosets() {
  return new Promise((resolve, reject) => {
    const req = request(URL, { headers: { 'User-Agent': 'dsp-calculator-research/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400) {
        res.resume();
        reject(new Error(`redirect ${res.statusCode}: ${res.headers.location}`));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        let json;
        try { json = JSON.parse(body.toString('utf8')); } catch (e) {
          reject(new Error(`fetched ${body.length} bytes but not valid JSON: ${e.message}`));
          return;
        }
        mkdirSync(RAW, { recursive: true });
        writeFileSync(RAW + 'protosets.json', body);
        resolve({ length: body.length, version: json.version });
      });
    });
    req.on('error', reject);
    req.setTimeout(60000, () => req.destroy(new Error('timeout')));
    req.end();
  });
}

// direct run
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href) {
  fetchProtosets().then((r) => {
    console.log(`OK protosets.json: ${r.length} bytes, game version ${r.version}`);
  }).catch((e) => {
    console.error('FAIL', e.message);
    process.exit(1);
  });
}

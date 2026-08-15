import { writeFileSync } from 'node:fs';
import { request } from 'node:https';

function get(url) {
  return new Promise((resolve, reject) => {
    const req = request(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36', 'Accept-Language': 'zh-CN,zh;q=0.9' } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('timeout')));
    req.end();
  });
}

const targets = [
  ['制造公式', 'research/raw/zh_recipes.txt'],
  ['公式合集', 'research/raw/zh_formulas.txt'],
  ['合成面板', 'research/raw/zh_craft_panel.txt'],
];

for (const [name, fn] of targets) {
  const enc = encodeURIComponent(name);
  const r = await get(`https://wiki.biligame.com/dsp/${enc}?action=raw`);
  writeFileSync(fn, r.body);
  const ok = r.body.includes('{{');
  console.log(`${name}: status=${r.status} len=${r.body.length} real=${ok}`);
  await new Promise((res) => setTimeout(res, 3000));
}

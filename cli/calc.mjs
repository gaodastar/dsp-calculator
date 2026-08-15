#!/usr/bin/env node
// DSP 量化计算器 — 命令行版
// 用法: node cli/calc.mjs <物品> <每分钟产量> [选项]
// 示例: node cli/calc.mjs 宇宙矩阵 60 --proliferator 3 --json
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createEngine } from '../src/engine.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const dataset = JSON.parse(readFileSync(ROOT + 'data/dsp-data.json', 'utf8'));
const engine = createEngine(dataset);

function findItem(query) {
  const q = String(query).trim().toLowerCase();
  if (!q) return null;
  let exact = dataset.items.find((i) => i.name.toLowerCase() === q || (i.zh && i.zh.toLowerCase() === q));
  if (exact) return exact;
  const matches = dataset.items.filter(
    (i) => i.name.toLowerCase().includes(q) || (i.zh && i.zh.includes(q))
  );
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    console.error(`「${query}」匹配到多个物品: ${matches.slice(0, 10).map((i) => `${i.zh}(${i.name})`).join(', ')}${matches.length > 10 ? ' …' : ''}`);
    process.exit(1);
  }
  return null;
}

function parseArgs(argv) {
  const opts = {
    target: null,
    machineSel: {},
    proliferator: { tier: 0, mode: 'extra' },
    selfSpray: true,
    recipeChoices: {},
    json: false,
    list: false,
    info: null,
    detail: null,
  };
  let positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') opts.json = true;
    else if (a === '--list' || a === '-l') opts.list = true;
    else if (a === '--info') { opts.info = argv[++i]; }
    else if (a === '--proliferator' || a === '--p') opts.proliferator.tier = Number(argv[++i]);
    else if (a === '--mode') opts.proliferator.mode = argv[++i] === 'speed' ? 'speed' : 'extra';
    else if (a === '--no-self-spray') opts.selfSpray = false;
    else if (a === '--machine') {
      for (const kv of argv[++i].split(',')) {
        const [k, v] = kv.split('=');
        opts.machineSel[k] = v;
      }
    } else if (a === '--choice') {
      for (const kv of argv[++i].split(',')) {
        const [k, v] = kv.split('=');
        const item = findItem(k);
        if (!item) { console.error(`未知物品: ${k}`); process.exit(1); }
        const rec = dataset.recipes.find((r) => r.name === v || String(r.id) === v);
        if (rec) opts.recipeChoices[item.id] = { kind: 'recipe', recipeId: rec.id };
        else if (v === 'vein' || v === 'ocean' || v === 'gas' || v === 'oil' || v === 'photon') opts.recipeChoices[item.id] = { kind: 'source', source: v };
        else { console.error(`未知配方/来源: ${v}`); process.exit(1); }
      }
    } else if (a === '--veins-per-miner') opts.mineVeinsPerMiner = Number(argv[++i]);
    else if (a === '--mining-machine') opts.miningMachine = argv[++i];
    else if (a === '--oil') opts.oilYieldPerMin = Number(argv[++i]);
    else if (a === '--fraction-belt') opts.fractionBelt = argv[++i];
    else if (a === '--fraction-stack') opts.fractionStack = Number(argv[++i]);
    else if (a === '--photon-lens') opts.photonLens = true;
    else positional.push(a);
  }
  if (positional.length >= 1 && !opts.list && !opts.info) {
    const item = findItem(positional[0]);
    if (!item) { console.error(`找不到物品「${positional[0]}」。用 --list 查看全部物品。`); process.exit(1); }
    opts.target = { itemId: item.id, ratePerMin: positional[1] ? Number(positional[1]) : 60 };
  }
  if (opts.list && positional.length) opts.listFilter = positional[0];
  return opts;
}

function fmtNum(n) {
  if (!isFinite(n)) return '∞';
  if (Math.abs(n) >= 1000) return n.toFixed(0);
  if (Math.abs(n) >= 100) return n.toFixed(1);
  if (Math.abs(n) >= 10) return n.toFixed(2);
  return n.toFixed(3);
}

// display-width aware padding: CJK chars occupy 2 columns in terminals
const CJK = /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF\u3000-\u303F]/;
function dispLen(s) {
  let w = 0;
  for (const ch of String(s)) w += CJK.test(ch) ? 2 : 1;
  return w;
}
function padEndW(s, n) {
  return String(s) + ' '.repeat(Math.max(0, n - dispLen(s)));
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.list) {
    const q = (opts.listFilter || '').toLowerCase();
    const items = dataset.items.filter((i) => !q || i.name.toLowerCase().includes(q) || (i.zh && i.zh.includes(q)));
    for (const i of items) {
      console.log(`${padEndW(String(i.id), 5)} ${padEndW(i.zh || '', 10)} ${i.name}  [${i.category}]`);
    }
    console.log(`\n共 ${items.length} 种物品`);
    return;
  }

  if (opts.info) {
    const item = findItem(opts.info);
    if (!item) { console.error(`找不到物品「${opts.info}」`); process.exit(1); }
    console.log(`=== ${item.zh} (${item.name})  ID=${item.id}  分类=${item.category}${item.isFluid ? ' 流体' : ''} ===`);
    if (item.description) console.log(item.description);
    console.log('\n生产方式:');
    for (const o of engine.optionsForItem(item.id)) console.log(`  • ${o.label}${o.description ? ' — ' + o.description : ''}`);
    console.log('\n用途:');
    const uses = dataset.recipes.filter((r) => r.in.some(([id]) => id === item.id));
    for (const r of uses) {
      const outs = r.out.map(([id, c]) => `${dataset.items.find((x) => x.id === id).zh}×${c}`).join('+');
      console.log(`  • ${r.name} → ${outs}`);
    }
    return;
  }

  if (!opts.target) {
    console.log(`戴森球计划 量化计算器 (数据: dsp-wiki.com, 游戏 v${dataset.gameVersion})
用法:
  node cli/calc.mjs <物品> [产量/分钟] [选项]
示例:
  node cli/calc.mjs 铁块 60
  node cli/calc.mjs 宇宙矩阵 30 --proliferator 3
  node cli/calc.mjs 重氢 60 --choice 重氢=分馏
  node cli/calc.mjs 铁块 60 --machine Smelt=位面熔炉
选项:
  --list [关键词]              列出物品
  --info <物品>                查看物品详情
  --proliferator <1|2|3>      增殖剂等级 (默认 0=不用)
  --mode <extra|speed>        增殖剂模式 (默认 extra)
  --no-self-spray             增殖剂不自我喷涂
  --machine <类型=机器,...>    机器选择 (Smelt/Assemble/Chemical/Research/MiningMachine)
  --choice <物品=配方,...>     生产方式覆盖 (配方名/ID 或 vein/ocean/gas/oil/photon)
  --veins-per-miner <n>       每台采矿机覆盖矿脉数 (默认 1)
  --oil <n>                   原油渗出点产量/分钟 (默认 120)
  --fraction-belt <名>        分馏传送带 (默认 Conveyor Belt Mk.III)
  --fraction-stack <1-4>      分馏氢堆叠层数 (默认 1)
  --photon-lens               射线接收站加装引力透镜
  --json                      输出 JSON`);
    return;
  }

  const r = engine.computeChainWithProliferator({
    target: opts.target,
    machines: opts.machineSel,
    proliferator: opts.proliferator,
    selfSpray: opts.selfSpray,
    recipeChoices: opts.recipeChoices,
    mineVeinsPerMiner: opts.mineVeinsPerMiner,
    miningMachine: opts.miningMachine,
    oilYieldPerMin: opts.oilYieldPerMin,
    fractionBelt: opts.fractionBelt,
    fractionStack: opts.fractionStack,
    photonLens: opts.photonLens,
  });

  if (opts.json) {
    console.log(JSON.stringify(r, null, 2));
    return;
  }

  const { result } = r;
  const t = result.target.item;
  console.log(`\n══════ 目标: ${t.zh} (${t.name}) × ${fmtNum(opts.target.ratePerMin)}/分钟 ══════`);
  console.log(`数据: dsp-wiki.com · 游戏版本 ${dataset.gameVersion}`);

  console.log('\n—— 生产设施 ——');
  for (const row of result.recipes) {
    const rzh = engine.recipeById(row.recipeId)?.zh || row.name;
    const ins = row.in.map((x) => `${engine.itemById(x.itemId).zh}×${fmtNum(x.perMin)}`).join(' + ');
    const outs = row.out.map((x) => `${engine.itemById(x.itemId).zh}×${fmtNum(x.perMin)}`).join(' + ');
    const machineInfo = row.machine === 'Fractionate'
      ? `${row.machineName}×${row.machines} (传送带 ${row.belt} · 堆叠×${row.stack})`
      : `${row.machineName}×${row.machines} (精确 ${fmtNum(row.machinesExact)})`;
    console.log(`  ${padEndW(rzh, 26)} ${padEndW(machineInfo, 42)} ${row.powerMW.toFixed(2)} MW`);
    console.log(`     ${ins}  →  ${outs}`);
    if (row.note) console.log(`     ⓘ ${row.note}`);
  }
  if (result.extraction.length) {
    console.log('\n—— 采集设施 ——');
    for (const e of result.extraction) {
      if (e.sourceKind === 'gas') {
        const gases = e.items.map((x) => `${engine.itemById(x.itemId).zh}×${fmtNum(x.perMin)}`).join(' + ');
        console.log(`  轨道采集器×${e.machines}  气巨星同步采集: ${gases}  自供电`);
      } else {
        const it = engine.itemById(e.itemId);
        const power = e.powerMW > 0 ? `  ${e.powerMW.toFixed(2)} MW` : '';
        console.log(`  ${padEndW(it.zh + '(' + it.name + ')', 20)} ${e.machineZh}×${e.machines}  ${fmtNum(e.perMin)}/min${power}  ${e.note}`);
      }
    }
  }
  if (result.rawMaterials.length) {
    console.log('\n—— 原材料需求 / 分钟 ——');
    for (const m of result.rawMaterials) {
      const it = engine.itemById(m.itemId);
      console.log(`  ${padEndW(it.zh + '(' + it.name + ')', 22)} ${fmtNum(m.perMin)}  (来源: ${m.sourceKind})`);
    }
  }
  if (result.surplus.length) {
    console.log('\n—— 副产物/盈余 ——');
    for (const s of result.surplus) {
      const it = engine.itemById(s.itemId);
      console.log(`  ${padEndW(it.zh + '(' + it.name + ')', 22)} ${fmtNum(s.perMin)}/min  ${s.note}`);
    }
  }
  if (result.external.length) {
    console.log('\n—— 外部供应（无法生产）——');
    for (const e of result.external) {
      const it = engine.itemById(e.itemId);
      console.log(`  ${padEndW(it.zh + '(' + it.name + ')', 22)} ${fmtNum(e.perMin)}/min`);
    }
  }
  if (r.proliferator) {
    const p = r.proliferator;
    const it = engine.itemById(p.itemId);
    console.log(`\n—— 增殖剂 ——`);
    console.log(`  ${it.zh} × ${fmtNum(p.perMin)}/min (喷涂量 ${fmtNum(p.spraysPerMin)}/min, 每瓶 ${p.spraysPerItem} 次)`);
  }
  console.log(`\n—— 汇总 ——`);
  console.log(`  总机器数: ${result.recipes.reduce((s, x) => s + x.machines, 0) + result.extraction.reduce((s, x) => s + x.machines, 0)}`);
  console.log(`  总电力: ${result.power.totalMW.toFixed(2)} MW (其中空载 ${result.power.idleMW.toFixed(2)} MW)`);
  if (result.power.dysonSphereLoadMW > 0) console.log(`  戴森球负载: ${result.power.dysonSphereLoadMW.toFixed(0)} MW`);
  console.log('');
}

main();

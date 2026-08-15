// Engine tests — validate data integrity and calculation correctness.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createEngine, fmt } from '../src/engine.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const dataset = JSON.parse(readFileSync(ROOT + 'data/dsp-data.json', 'utf8'));
const engine = createEngine(dataset);
const itemByName = engine.itemByName;
const itemById = engine.itemById;

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}\n    ${e.message}`);
  }
}
function approx(a, b, eps = 1e-6, msg = '') {
  if (Math.abs(a - b) > eps * Math.max(1, Math.abs(b))) {
    throw new Error(`expected ${a} ≈ ${b} ${msg}`);
  }
}

console.log('== data integrity ==');
check('all items have zh names', () => {
  for (const i of dataset.items) if (!i.zh) throw new Error(`missing zh: ${i.name}`);
});
check('all recipes have zh names', () => {
  for (const r of dataset.recipes) if (!r.zh) throw new Error(`recipe missing zh: ${r.name}`);
});
check('special recipe zh names match the bilibili wiki', () => {
  const expect = {
    'Plasma Refining': '等离子精炼',
    'X-ray Cracking': 'X射线裂解',
    'Reformed Refinement': '重整精炼',
    'Deuterium Fractionation': '重氢分馏',
    'Mass-energy Storage': '质能储存',
    'Space Warper (advanced)': '空间翘曲器（高级）',
    'Graphene (advanced)': '石墨烯（高效）',
    'Organic Crystal (original)': '有机晶体（原始）',
    ' - Thruster': '推进器',
  };
  for (const [en, zh] of Object.entries(expect)) {
    const r = dataset.recipes.find((x) => x.name === en);
    if (!r) throw new Error(`recipe not found: ${en}`);
    if (r.zh !== zh) throw new Error(`recipe ${en}: expected zh ${zh}, got ${r.zh}`);
  }
});
check('all recipe ingredients resolve to items', () => {
  for (const r of dataset.recipes) {
    for (const [id] of [...r.in, ...r.out]) {
      if (!itemById(id)) throw new Error(`recipe ${r.name} references unknown item ${id}`);
    }
  }
});
check('recipe times positive', () => {
  for (const r of dataset.recipes) if (r.time <= 0) throw new Error(`recipe ${r.name} time ${r.time}`);
});
check('each item has at most one recipe named after it', () => {
  const seen = new Map();
  for (const i of dataset.items) {
    const n = dataset.recipes.filter((r) => r.name === i.name);
    if (n.length > 1) seen.set(i.name, n.length);
  }
  for (const [k, v] of seen) throw new Error(`${k}: ${v} recipes`);
});
check('machine variant speeds/powers present', () => {
  for (const [type, m] of Object.entries(dataset.machines)) {
    for (const v of m.variants) {
      if (!(v.speed > 0) || !(v.power > 0)) throw new Error(`${type} ${v.name}`);
    }
  }
});

console.log('== basic chains ==');
check('iron ingot 60/min -> 1 smelter, 60 ore', () => {
  const r = engine.computeChain({ target: { itemId: itemByName('Iron Ingot').id, ratePerMin: 60 } });
  const row = r.recipes.find((x) => x.name === 'Iron Ingot');
  approx(row.machines, 1, 1e-9);
  approx(row.in[0].perMin, 60);
  approx(r.rawMaterials[0].perMin, 60);
  if (r.rawMaterials[0].itemId !== itemByName('Iron Ore').id) throw new Error('raw material should be iron ore');
});
check('magnetic coil 120/min inputs', () => {
  const r = engine.computeChain({ target: { itemId: itemByName('Magnetic Coil').id, ratePerMin: 120 } });
  const row = r.recipes.find((x) => x.name === 'Magnetic Coil');
  approx(row.craftsPerMin, 60);
  // 2 magnet + 1 copper ingot per craft
  approx(row.in.find((x) => x.itemId === itemByName('Magnet').id).perMin, 120);
  approx(row.in.find((x) => x.itemId === itemByName('Copper Ingot').id).perMin, 60);
  const ore = Object.fromEntries(r.rawMaterials.map((m) => [m.itemId, m.perMin]));
  approx(ore[itemByName('Iron Ore').id], 120);
  approx(ore[itemByName('Copper Ore').id], 60);
});
check('machine tiers: Mk.III assembler count = exact/1.5', () => {
  const r = engine.computeChain({ target: { itemId: itemByName('Iron Ingot').id, ratePerMin: 60 } });
  const r2 = engine.computeChain({
    target: { itemId: itemByName('Gear').id, ratePerMin: 90 },
    machines: { Assemble: 'Assembling Machine Mk.I' },
  });
  const row = r2.recipes.find((x) => x.name === 'Gear');
  approx(row.machinesExact, 90 / 60 * 1 / 0.75);
  approx(row.machines, 2);
});
check('plane smelter halves smelter count', () => {
  const a = engine.computeChain({ target: { itemId: itemByName('Steel').id, ratePerMin: 60 } });
  const b = engine.computeChain({
    target: { itemId: itemByName('Steel').id, ratePerMin: 60 },
    machines: { Smelt: 'Plane Smelter' },
  });
  const ra = a.recipes.find((x) => x.name === 'Steel');
  const rb = b.recipes.find((x) => x.name === 'Steel');
  // steel: 3 iron ingots -> 1 steel, 3s
  approx(ra.machinesExact, 3 * 1);
  approx(rb.machinesExact, 1.5);
});

console.log('== cycles & oil ==');
check('x-ray cracking for graphite feeds refined oil demand (cycle)', () => {
  const r = engine.computeChain({
    target: { itemId: itemByName('Energetic Graphite').id, ratePerMin: 30 },
    recipeChoices: { [itemByName('Energetic Graphite').id]: { kind: 'recipe', recipeId: 58 } },
  });
  // x-ray: 2 H2 + 1 refined -> 1 graphite + 3 H2 in 4s; 30 graphite/min = 0.5 craft/s
  const xray = r.recipes.find((x) => x.recipeId === 58);
  approx(xray.craftsPerMin, 30);
  // refined oil demand = 30/min -> plasma refining 15 crafts/min (2 refined per craft)
  const plasma = r.recipes.find((x) => x.recipeId === 16);
  approx(plasma.craftsPerMin, 15);
  // x-ray is net H2 producer (+1 per craft = 30/min), plasma adds 1 H2 per craft (15/min)
  const h2 = r.surplus.find((x) => x.itemId === itemByName('Hydrogen').id);
  approx(h2.perMin, 45);
});
check('reforming refine: refined oil self-loop', () => {
  const r = engine.computeChain({
    target: { itemId: itemByName('Refined Oil').id, ratePerMin: 30 },
    recipeChoices: { [itemByName('Refined Oil').id]: { kind: 'recipe', recipeId: 121 } },
  });
  // 2 refined + 1 H2 + 1 coal -> 3 refined: net +1 refined per craft
  const row = r.recipes.find((x) => x.recipeId === 121);
  approx(row.craftsPerMin, 30);
  const coal = r.rawMaterials.find((m) => m.itemId === itemByName('Coal').id);
  approx(coal.perMin, 30);
});
check('same recipe chosen for two items throws', () => {
  let threw = false;
  try {
    engine.computeChain({
      target: { itemId: itemByName('Energetic Graphite').id, ratePerMin: 30 },
      recipeChoices: {
        [itemByName('Energetic Graphite').id]: { kind: 'recipe', recipeId: 58 },
        [itemByName('Hydrogen').id]: { kind: 'recipe', recipeId: 58 },
      },
    });
  } catch (e) { threw = true; }
  if (!threw) throw new Error('expected mismatch error');
});
check('infeasible loop (H2 and refined oil both from plasma) throws', () => {
  let threw = false;
  try {
    engine.computeChain({
      targets: [
        { itemId: itemByName('Refined Oil').id, ratePerMin: 30 },
        { itemId: itemByName('Deuterium').id, ratePerMin: 18 },
      ],
      recipeChoices: {
        [itemByName('Deuterium').id]: { kind: 'recipe', recipeId: 115 },
        [itemByName('Hydrogen').id]: { kind: 'recipe', recipeId: 16 },
        [itemByName('Refined Oil').id]: { kind: 'recipe', recipeId: 16 },
      },
    });
  } catch (e) { threw = true; }
  if (!threw) throw new Error('expected mismatch/infeasible error');
});

console.log('== deuterium ==');
check('fractionation 18/min on Mk.III belt -> 1 fractionator, 18 H2 net', () => {
  const r = engine.computeChain({
    target: { itemId: itemByName('Deuterium').id, ratePerMin: 18 },
    recipeChoices: { [itemByName('Deuterium').id]: { kind: 'recipe', recipeId: 115 } },
  });
  const row = r.recipes.find((x) => x.recipeId === 115);
  approx(row.machines, 1);
  // net hydrogen consumption is 1:1 (loop recycling), not 100:1
  // (the gas giant collectors also co-produce 0.96 D2/min, so fractionation fills 17.04)
  approx(row.in[0].perMin, 18 - 0.96);
  // hydrogen comes from a gas giant: 3 collectors (8*0.96=7.68/min each),
  // co-producing deuterium (8*0.04*3 = 0.96/min) which offsets fractionation
  const gasRow = r.extraction.find((x) => x.sourceKind === 'gas');
  approx(gasRow.machines, 3);
  const d2 = gasRow.items.find((x) => x.itemId === itemByName('Deuterium').id);
  approx(d2.perMin, 0.96);
  const h2 = r.surplus.find((m) => m.itemId === itemByName('Hydrogen').id);
  approx(h2.perMin, 3 * 7.68 - (18 - 0.96));
});
check('gas giant co-gas byproduct offsets fractionation demand', () => {
  const r = engine.computeChain({
    target: { itemId: itemByName('Deuterium').id, ratePerMin: 60 },
    recipeChoices: { [itemByName('Deuterium').id]: { kind: 'recipe', recipeId: 115 } },
  });
  const row = r.recipes.find((x) => x.recipeId === 115);
  // collectors co-produce 0.32 D2/min each -> fractionation only fills the rest
  const gasRow = r.extraction.find((x) => x.sourceKind === 'gas');
  const coD2 = gasRow.items.find((x) => x.itemId === itemByName('Deuterium').id).perMin;
  approx(row.out[0].perMin, 60 - coD2);
  approx(row.in[0].perMin, 60 - coD2);
});
check('fire-ice gas giant produces hydrogen byproduct', () => {
  // graphene from fire ice (gas giant Gas 3: fire ice 0.7 + hydrogen 0.3)
  const r = engine.computeChain({
    target: { itemId: itemByName('Graphene').id, ratePerMin: 60 },
    recipeChoices: {
      [itemByName('Graphene').id]: { kind: 'recipe', recipeId: 32 },
      [itemByName('Fire Ice').id]: { kind: 'source', source: 'gas' },
    },
  });
  // graphene (advanced): 2 fire ice -> 2 graphene + 1 hydrogen per 2s
  const row = r.recipes.find((x) => x.recipeId === 32);
  approx(row.craftsPerMin, 30);
  approx(row.in[0].perMin, 60); // fire ice 1:1
  const gasRow = r.extraction.find((x) => x.sourceKind === 'gas');
  // fire ice need 60 -> collectors = ceil(60/(8*0.7)) = 11; H2 byproduct 11*8*0.3=26.4
  approx(gasRow.machines, 11);
  const h2By = gasRow.items.find((x) => x.itemId === itemByName('Hydrogen').id);
  approx(h2By.perMin, 26.4);
});
check('collider deuterium 30/min -> offset by gas co-product', () => {
  const r = engine.computeChain({
    target: { itemId: itemByName('Deuterium').id, ratePerMin: 30 },
    recipeChoices: { [itemByName('Deuterium').id]: { kind: 'recipe', recipeId: 40 } },
  });
  // 10 H2 -> 5 D2 in 2.5s; hydrogen gas giant collectors co-produce 0.32 D2/min each
  const gasRow = r.extraction.find((x) => x.sourceKind === 'gas');
  const coD2 = gasRow.items.find((x) => x.itemId === itemByName('Deuterium').id).perMin;
  const colliderD2 = 30 - coD2; // D2/min actually made by the collider
  const row = r.recipes.find((x) => x.recipeId === 40);
  approx(row.machinesExact, (colliderD2 / 5) * 2.5 / 60);
  approx(row.in[0].perMin, (colliderD2 / 5) * 10);
});

console.log('== proliferator ==');
check('Mk.III extra products on iron ingot: 48 ore for 60 ingots', () => {
  const r = engine.computeChainWithProliferator({
    target: { itemId: itemByName('Iron Ingot').id, ratePerMin: 60 },
    proliferator: { tier: 3, mode: 'extra' },
  });
  const ore = r.result.rawMaterials.find((m) => m.itemId === itemByName('Iron Ore').id);
  approx(ore.perMin, 48);
});
check('Mk.III speedup halves machines', () => {
  const r = engine.computeChainWithProliferator({
    target: { itemId: itemByName('Iron Ingot').id, ratePerMin: 60 },
    proliferator: { tier: 3, mode: 'speed' },
  });
  const row = r.result.recipes.find((x) => x.name === 'Iron Ingot');
  approx(row.machinesExact, 0.5);
});
check('proliferator demand computed and chain included', () => {
  const r = engine.computeChainWithProliferator({
    target: { itemId: itemByName('Iron Ingot').id, ratePerMin: 60 },
    proliferator: { tier: 3, mode: 'extra' },
  });
  if (!r.proliferator || r.proliferator.perMin <= 0) throw new Error('no proliferator demand');
  const pRow = r.result.recipes.find((x) => x.name === 'Proliferator Mk.III');
  if (!pRow) throw new Error('proliferator chain missing');
  // sprays: 48 ore/min sprayed -> 48 sprays/min; self-sprayed Mk.III = 60*1.25 sprays/item
  // fixed point incl. proliferator's own chain: ~0.815 proliferator/min
  approx(r.proliferator.perMin, 0.815, 0.1);
});

console.log('== heavy integration ==');
check('universe matrix 30/min solves', () => {
  const r = engine.computeChainWithProliferator({
    target: { itemId: itemByName('Universe Matrix').id, ratePerMin: 30 },
  });
  const row = r.result.recipes.find((x) => x.name === 'Universe Matrix');
  approx(row.craftsPerMin, 30);
  const am = r.result.items.find((x) => x.itemId === itemByName('Antimatter').id);
  approx(am.consumedPerMin, 30);
});
check('antimatter fuel rod 10/min: photon receivers counted', () => {
  const r = engine.computeChain({
    target: { itemId: itemByName('Antimatter Fuel Rod').id, ratePerMin: 10 },
  });
  // 12 AM + 12 H2 + ... -> 2 rods per 24s: 10 rods/min = 5 crafts/min
  const row = r.recipes.find((x) => x.name === 'Antimatter Fuel Rod');
  approx(row.craftsPerMin, 5);
  const am = r.recipes.find((x) => x.name === 'Mass-energy Storage');
  approx(am.craftsPerMin, 30); // 12 AM per craft * 5 = 60 AM/min; 2 AM per craft -> 30
  const photon = r.extraction.find((x) => x.itemId === itemByName('Critical Photon').id);
  approx(photon.perMin, 60);
  approx(photon.machines, 10); // 6/min per receiver
  approx(r.power.dysonSphereLoadMW, 1200);
});
check('space warper default (advanced) selected properly', () => {
  const r = engine.computeChain({ target: { itemId: itemByName('Space Warper').id, ratePerMin: 60 } });
  const row = r.recipes.find((x) => x.name === 'Space Warper');
  approx(row.craftsPerMin, 60);
});

console.log('== full sweep: every item solvable at 60/min ==');
check('all 174 items compute without error', () => {
  const failures = [];
  for (const item of dataset.items) {
    try {
      const r = engine.computeChain({ target: { itemId: item.id, ratePerMin: 60 } });
      const hasOutput = r.recipes.length || r.extraction.length || r.external.length || r.rawMaterials.length;
      if (!hasOutput) failures.push(`${item.name}: empty chain`);
    } catch (e) {
      failures.push(`${item.name}: ${e.message}`);
    }
  }
  if (failures.length) throw new Error(failures.slice(0, 12).join('\n    ') + (failures.length > 12 ? `\n    ... and ${failures.length - 12} more` : ''));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

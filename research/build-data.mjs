// Build the complete DSP dataset from the wiki's protosets.json + machine data
// gathered from dsp-wiki.com building pages (ItemInfo subpages) and Chinese names
// from wiki.biligame.com/dsp index pages.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fetchProtosets } from './fetch-protosets.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const RAW = ROOT + 'research/raw/';
const OUT = ROOT + 'data/';

// auto-fetch the wiki data snapshot when missing (e.g. fresh CI checkout),
// or always with --refresh (data refresh pipeline)
const forceRefresh = process.argv.includes('--refresh');
if (forceRefresh || !existsSync(RAW + 'protosets.json')) {
  console.log(forceRefresh ? '--refresh: refetching from dsp-wiki.com …' : 'protosets.json not found — fetching from dsp-wiki.com …');
  const r = await fetchProtosets();
  console.log(`fetched ${r.length} bytes (game version ${r.version})`);
}

const protosets = JSON.parse(readFileSync(RAW + 'protosets.json', 'utf8'));
const itemsRaw = protosets.ItemProtoSet.dataArray;
const recipesRaw = protosets.RecipeProtoSet.dataArray;
const techsRaw = protosets.TechProtoSet.dataArray;
const veinsRaw = protosets.VeinProtoSet.dataArray;
const themesRaw = protosets.ThemeProtoSet.dataArray;

// ---------------------------------------------------------------------------
// Machine data — from dsp-wiki.com /ItemInfo pages (game 0.10.34.28281)
// speed: production speed multiplier; power: work consumption in kW
// ---------------------------------------------------------------------------
const MACHINES = {
  Smelt: {
    label: 'Smelter', zh: '熔炉',
    variants: [
      { name: 'Arc Smelter', zh: '电弧熔炉', speed: 1, power: 360, idle: 12 },
      { name: 'Plane Smelter', zh: '位面熔炉', speed: 2, power: 1440, idle: 48 },
      { name: 'Negentropy Smelter', zh: '负熵熔炉', speed: 3, power: 2880, idle: 96 },
    ],
  },
  Assemble: {
    label: 'Assembler', zh: '制造台',
    variants: [
      { name: 'Assembling Machine Mk.I', zh: '制造台Mk.I', speed: 0.75, power: 270, idle: 12 },
      { name: 'Assembling Machine Mk.II', zh: '制造台Mk.II', speed: 1, power: 540, idle: 15 },
      { name: 'Assembling Machine Mk.III', zh: '制造台Mk.III', speed: 1.5, power: 1080, idle: 18 },
      { name: 'Re-composing Assembler', zh: '重组式制造台', speed: 3, power: 2700, idle: 54 },
    ],
  },
  Refine: {
    label: 'Oil Refinery', zh: '原油精炼厂',
    variants: [{ name: 'Oil Refinery', zh: '原油精炼厂', speed: 1, power: 960, idle: 24 }],
  },
  Chemical: {
    label: 'Chemical Plant', zh: '化工厂',
    variants: [
      { name: 'Chemical Plant', zh: '化工厂', speed: 1, power: 720, idle: 24 },
      { name: 'Quantum Chemical Plant', zh: '量子化工厂', speed: 2, power: 2160, idle: 36 },
    ],
  },
  Particle: {
    label: 'Miniature Particle Collider', zh: '微型粒子对撞机',
    variants: [{ name: 'Miniature Particle Collider', zh: '微型粒子对撞机', speed: 1, power: 12000, idle: 120 }],
  },
  Research: {
    label: 'Matrix Lab', zh: '矩阵研究站',
    variants: [
      { name: 'Matrix Lab', zh: '矩阵研究站', speed: 1, power: 480, idle: 12 },
      { name: 'Self-evolution Lab', zh: '自演化研究站', speed: 3, power: 1920, idle: 48 },
    ],
  },
  Fractionate: {
    label: 'Fractionator', zh: '分馏塔',
    variants: [{ name: 'Fractionator', zh: '分馏塔', speed: 1, power: 720, idle: 18 }],
  },
};

// Extraction machines (rate per minute per unit)
const MINING = {
  'Mining Machine': { zh: '采矿机', ratePerMin: 30, power: 420, idle: 24, unit: 'per vein' },
  'Advanced Mining Machine': { zh: '大型采矿机', ratePerMin: 60, power: 2940, idle: 168, unit: 'per vein' },
  'Water Pump': { zh: '抽水站', ratePerMin: 50, power: 300, idle: 12, unit: '' },
  'Oil Extractor': { zh: '原油萃取站', ratePerMin: 132, power: 840, idle: 24, unit: 'per seep (2.2/s default)' },
  'Orbital Collector': { zh: '轨道采集器', ratePerMin: 8, power: 30000, idle: 0, unit: 'per gas type' },
};

// Proliferator data — from dsp-wiki.com Spray Coater page
const PROLIFERATOR = {
  1: { name: 'Proliferator Mk.I', zh: '增产剂Mk.I', sprays: 12, extra: 0.125, speedup: 0.25, energy: 0.30 },
  2: { name: 'Proliferator Mk.II', zh: '增产剂Mk.II', sprays: 24, extra: 0.20, speedup: 0.50, energy: 0.70 },
  3: { name: 'Proliferator Mk.III', zh: '增产剂Mk.III', sprays: 60, extra: 0.25, speedup: 1.00, energy: 1.50 },
};

// Conveyor belts — from dsp-wiki.com Arc Smelter page (360/720/1800 per minute)
const BELTS = [
  { name: 'Conveyor Belt Mk.I', zh: '传送带Mk.I', perMin: 360 },
  { name: 'Conveyor Belt Mk.II', zh: '传送带Mk.II', perMin: 720 },
  { name: 'Conveyor Belt Mk.III', zh: '传送带Mk.III', perMin: 1800 },
];

// ---------------------------------------------------------------------------
// Chinese names, parsed from the bilibili wiki index pages.
// Both indexes are positionally aligned with the dsp-wiki Items/Buildings pages.
// ---------------------------------------------------------------------------
function extractZhTitles(wikitext) {
  return [...wikitext.matchAll(/\{\{图标\|([^}|]+)/g)].map((m) => m[1].trim());
}
const zhItems = extractZhTitles(readFileSync(RAW + 'zh_items.txt', 'utf8'));
const zhBuildings = extractZhTitles(readFileSync(RAW + 'zh_buildings.txt', 'utf8'));

// Positional English lists, mirroring the dsp-wiki Items/Buildings pages
const enItemsOrder = [
  'Iron Ore', 'Copper Ore', 'Stone', 'Coal', 'Silicon Ore', 'Titanium Ore', 'Water', 'Crude Oil',
  'Hydrogen', 'Deuterium', 'Antimatter', 'Core Element', 'Critical Photon', 'Kimberlite Ore',
  'Iron Ingot', 'Copper Ingot', 'Stone Brick', 'Energetic Graphite', 'High-Purity Silicon', 'Titanium Ingot',
  'Sulfuric Acid', 'Refined Oil', 'Hydrogen Fuel Rod', 'Deuteron Fuel Rod', 'Antimatter Fuel Rod',
  'Strange Annihilation Fuel Rod', 'Missile Set', 'Fractal Silicon',
  'Magnet', 'Magnetic Coil', 'Glass', 'Diamond', 'Crystal Silicon', 'Titanium Alloy', 'Combustible Unit',
  'Plastic', 'Organic Crystal', 'Graphene', 'Annihilation Constraint Sphere', 'Magnum Ammo Box',
  'Supersonic Missile Set', 'Grating Crystal',
  'Steel', 'Circuit Board', 'Prism', 'Electric Motor', 'Microcrystalline Component', 'Proliferator Mk.I',
  'Explosive Unit', 'Strange Matter', 'Titanium Crystal', 'Carbon Nanotube', 'Particle Broadband',
  'Titanium Ammo Box', 'Gravity Missile Set', 'Spiniform Stalagmite Crystal',
  'Gear', 'Plasma Exciter', 'Photon Combiner', 'Electromagnetic Turbine', 'Processor', 'Proliferator Mk.II',
  'Crystal Explosive Unit', 'Casimir Crystal', 'Titanium Glass', 'Plane Filter', 'Quantum Chip',
  'Superalloy Ammo Box', 'Shell Set', 'Unipolar Magnet',
  'Engine', 'Thruster', 'Reinforced Thruster', 'Super-Magnetic Ring', 'Particle Container',
  'Proliferator Mk.III', 'Prototype', 'Precision Drone', 'Attack Drone', 'Corvette', 'Destroyer',
  'Plasma Capsule', 'High-Explosive Shell Set', 'Fire Ice',
  'Logistics Bot', 'Logistics Drone', 'Logistics Vessel', 'Space Warper', 'Graviton Lens', 'Foundation',
  null, 'Solar Sail', 'Frame Material', 'Dyson Sphere Component', 'Small Carrier Rocket',
  'Antimatter Capsule', 'Crystal Shell Set', 'Log',
  'Electromagnetic Matrix', 'Energy Matrix', 'Structure Matrix', 'Information Matrix', 'Gravity Matrix',
  'Universe Matrix', 'Dark Fog Matrix', 'Energy Shard', 'Silicon-based Neuron', 'Negentropy Singularity',
  'Matter Recombinator', 'Jamming Capsule', 'Suppressing Capsule', 'Plant Fuel',
];

const enBuildingsOrder = [
  'Tesla Tower', 'Wireless Power Tower', 'Satellite Substation', 'Wind Turbine',
  'Thermal Power Plant', 'Solar Panel', 'Geothermal Power Station', 'Mini Fusion Power Plant',
  'Energy Exchanger', 'Accumulator', 'Full Accumulator', 'Ray Receiver', 'Artificial Star',
  'Conveyor Belt Mk.I', 'Conveyor Belt Mk.II', 'Conveyor Belt Mk.III', 'Splitter', 'Automatic Piler',
  'Traffic Monitor', 'Spray Coater', 'Storage Mk.I', 'Storage Mk.II', 'Storage Tank', 'Logistics Distributor',
  'Planetary Logistics Station', 'Interstellar Logistics Station', 'Orbital Collector',
  'Sorter Mk.I', 'Sorter Mk.II', 'Sorter Mk.III', 'Pile Sorter', 'Mining Machine', 'Advanced Mining Machine',
  'Water Pump', 'Oil Extractor', 'Oil Refinery', 'Fractionator', 'Chemical Plant', 'Quantum Chemical Plant',
  'Miniature Particle Collider',
  'Arc Smelter', 'Plane Smelter', 'Negentropy Smelter', 'Assembling Machine Mk.I', 'Assembling Machine Mk.II',
  'Assembling Machine Mk.III', 'Re-composing Assembler', 'Matrix Lab', 'Self-evolution Lab', 'Holo Beacon',
  'EM-Rail Ejector', 'Vertical Launching Silo',
  'Gauss Turret', 'Missile Turret', 'Implosion Cannon', 'Laser Turret', 'Plasma Turret', 'SR Plasma Turret',
  'Battlefield Analysis Base', 'Jammer Tower', 'Signal Tower', 'Planetary Shield Generator',
];

// Build English->Chinese maps
const zhMap = {};
for (let i = 0; i < enItemsOrder.length && i < zhItems.length; i++) {
  if (enItemsOrder[i]) zhMap[enItemsOrder[i]] = zhItems[i];
}
for (let i = 0; i < enBuildingsOrder.length && i < zhBuildings.length; i++) {
  if (enBuildingsOrder[i]) zhMap[enBuildingsOrder[i]] = zhBuildings[i];
}
// Semantic overrides: the Chinese row swapped Solar/Geothermal/Thermal order
zhMap['Solar Panel'] = '太阳能板';
zhMap['Geothermal Power Station'] = '地热发电站';
zhMap['Thermal Power Plant'] = '火力发电厂';
// protosets uses "Depot" (current in-game name) while the wikis use "Storage"
zhMap['Depot Mk.I'] = '小型储物仓';
zhMap['Depot Mk.II'] = '大型储物仓';
zhMap['Storage Mk.I'] = '小型储物仓';
zhMap['Storage Mk.II'] = '大型储物仓';
// Extra manual fixes for names that differ between protosets and wiki pages
zhMap['Logistics Drone'] = '物流运输机';
zhMap['Logistics Vessel'] = '星际物流运输船';
zhMap['Spiniform Stalagmite Crystal'] = '刺笋结晶';
zhMap['High-Explosive Shell Set'] = '高爆炮弹组';
zhMap['Crystal Shell Set'] = '晶石炮弹组';
zhMap['Strange Annihilation Fuel Rod'] = '奇异湮灭燃料棒';
zhMap['Self-evolution Lab'] = '自演化研究站';
// protosets name casing differences vs the wiki pages
zhMap['Stalagmite Crystal'] = '刺笋结晶';
zhMap['High-purity Silicon'] = '高纯硅块';
zhMap['Super-magnetic Ring'] = '超级磁场环';
zhMap['Interstellar Logistics Vessel'] = '星际物流运输船';
zhMap['Accumulator (full)'] = '蓄电器（满）';
zhMap['Soil Pile'] = '沙土';

// ---------------------------------------------------------------------------
// Chinese recipe names.
// Recipes named after an item reuse the item's zh name; process-style recipes
// and (advanced)/(original) variants follow the wiki.biligame.com/dsp
// 「合成面板」 page naming (verified 2025).
// ---------------------------------------------------------------------------
const RECIPE_ZH_SPECIAL = {
  'Plasma Refining': '等离子精炼',
  'X-ray Cracking': 'X射线裂解',
  'Reformed Refinement': '重整精炼',
  'Deuterium Fractionation': '重氢分馏',
  'Mass-energy Storage': '质能储存',
  'Space Warper (advanced)': '空间翘曲器（高级）',
};

function recipeZhName(rawName, zhItemByName) {
  // protosets quirk: some names carry a leading "- " (e.g. " - Thruster")
  const name = String(rawName).trim().replace(/^-\s+/, '');
  if (RECIPE_ZH_SPECIAL[name]) return RECIPE_ZH_SPECIAL[name];
  const m = name.match(/^(.*)\s+\((advanced|original)\)$/);
  if (m) {
    const baseZh = zhItemByName.get(m[1]);
    if (baseZh) return baseZh + (m[2] === 'advanced' ? '（高效）' : '（原始）');
  }
  return zhItemByName.get(name) || '';
}

// ---------------------------------------------------------------------------
// Item categories for UI grouping
// ---------------------------------------------------------------------------
const VEIN_ITEMS = new Map(veinsRaw.map((v) => [v.MiningItem, v]));
const WATER_ITEMS = new Map(
  themesRaw.filter((t) => t.WaterItemId > 0).map((t) => [t.WaterItemId, t.Name])
);
const GAS_ITEM_WEIGHTS = new Map();
for (const t of themesRaw) {
  if (t.GasItems && t.GasItems.length) {
    for (let k = 0; k < t.GasItems.length; k++) {
      const key = `${t.Name}|${t.GasItems[k]}`;
      GAS_ITEM_WEIGHTS.set(key, t.GasSpeeds ? t.GasSpeeds[k] : 1 / t.GasItems.length);
    }
  }
}

function categorizeItem(item, recipesMaking) {
  if (item.IsEntity) return 'building';
  if (item.Type === 'Matrix') return 'matrix';
  if (item.Type === 'Resource') return 'resource';
  if (recipesMaking.length === 0) {
    if (VEIN_ITEMS.has(item.ID)) return 'resource';
    if (WATER_ITEMS.has(item.ID)) return 'resource';
    if ([...GAS_ITEM_WEIGHTS.keys()].some((k) => k.endsWith(`|${item.ID}`))) return 'resource';
    if (item.EnemyDropRange && item.EnemyDropRange.y > 0) return 'darkfog';
    return 'other';
  }
  return 'component';
}

// ---------------------------------------------------------------------------
// Build the dataset
// ---------------------------------------------------------------------------
const itemById = new Map(itemsRaw.map((i) => [i.ID, i]));
const recipesMaking = new Map(); // itemId -> [recipe]
const recipesUsing = new Map();  // itemId -> [recipe]
for (const r of recipesRaw) {
  for (const outId of r.Results) {
    if (!recipesMaking.has(outId)) recipesMaking.set(outId, []);
    recipesMaking.get(outId).push(r);
  }
  for (const inId of r.Items) {
    if (!recipesUsing.has(inId)) recipesUsing.set(inId, []);
    recipesUsing.get(inId).push(r);
  }
}

// tech unlock mapping
const techByRecipe = new Map();
for (const t of techsRaw) {
  for (const rid of t.UnlockRecipes || []) techByRecipe.set(rid, t);
}

const items = itemsRaw.map((item) => {
  const making = recipesMaking.get(item.ID) || [];
  const sources = [];
  const vein = VEIN_ITEMS.get(item.ID);
  if (vein) sources.push({ kind: 'vein', name: vein.Name, zh: zhMap[vein.Name] || vein.Name });
  if (WATER_ITEMS.has(item.ID)) {
    sources.push({ kind: 'ocean', name: WATER_ITEMS.get(item.ID) });
  }
  const giants = [];
  for (const [key, weight] of GAS_ITEM_WEIGHTS) {
    if (key.endsWith(`|${item.ID}`)) giants.push({ theme: key.split('|')[0], weight });
  }
  if (giants.length) sources.push({ kind: 'gas', giants });
  if (item.EnemyDropRange && item.EnemyDropRange.y > 0) sources.push({ kind: 'darkfog' });
  if (item.Name === 'Accumulator (full)') sources.push({ kind: 'energyExchanger' });

  return {
    id: item.ID,
    name: item.Name,
    zh: zhMap[item.Name] || '',
    type: item.Type,
    category: categorizeItem(item, making),
    isFluid: !!item.IsFluid,
    isEntity: !!item.IsEntity,
    gridIndex: item.GridIndex,
    stackSize: item.StackSize,
    heatValue: item.HeatValue,
    fuelType: item.FuelType,
    productive: !!item.Productive,
    description: item.Description || '',
    sources,
    recipesMaking: making.map((r) => r.ID),
    recipesUsing: (recipesUsing.get(item.ID) || []).map((r) => r.ID),
  };
});

const zhItemByName = new Map(Object.entries(zhMap));
const recipes = recipesRaw.map((r) => ({
  id: r.ID,
  name: r.Name,
  zh: recipeZhName(r.Name, zhItemByName),
  machine: r.Type,
  time: r.TimeSpend / 60, // ticks -> seconds
  handcraft: !!r.Handcraft,
  explicit: !!r.Explicit,
  nonProductive: !!r.NonProductive,
  gridIndex: r.GridIndex,
  in: r.Items.map((id, k) => [id, r.ItemCounts[k]]),
  out: r.Results.map((id, k) => [id, r.ResultCounts[k]]),
  tech: techByRecipe.get(r.ID) ? techByRecipe.get(r.ID).Name : null,
}));

// map canonical machine names to item zh names for the machine variants
for (const [type, m] of Object.entries(MACHINES)) {
  for (const v of m.variants) {
    v.itemId = itemsRaw.find((i) => i.Name === v.name)?.ID ?? null;
  }
}

const veins = veinsRaw.map((v) => ({
  id: v.ID,
  name: v.Name,
  itemId: v.MiningItem,
  zh: ({ 'Iron Veins': '铁矿脉', 'Copper Veins': '铜矿脉', 'Silicon Veins': '硅矿脉', 'Titanium Veins': '钛矿脉', 'Stone Veins': '石矿脉', 'Coal Veins': '煤矿脉', 'Crude Oil Seep': '原油渗出点', 'Fire Ice Veins': '可燃冰矿脉', 'Kimberlite Veins': '金伯利矿脉', 'Fractal Silicon Veins': '分形硅矿脉', 'Organic Crystal Veins': '有机晶体矿脉', 'Grating Crystal Veins': '光栅石矿脉', 'Stalagmite Crystal Veins': '刺笋结晶矿脉', 'Unipolar Magnet Veins': '单极磁石矿脉' })[v.Name] || v.Name,
}));

const gasGiants = [];
for (const t of themesRaw) {
  if (t.GasItems && t.GasItems.length) {
    gasGiants.push({
      name: t.Name,
      gases: t.GasItems.map((id, k) => ({ itemId: id, weight: t.GasSpeeds ? t.GasSpeeds[k] : 1 })),
    });
  }
}

const dataset = {
  gameVersion: protosets.version,
  dataSource: {
    protosets: 'https://dsp-wiki.com/Module:GameData/protosets.json',
    machines: 'https://dsp-wiki.com/ (building /ItemInfo pages)',
    zhNames: 'https://wiki.biligame.com/dsp/ (物品 & 建筑 index pages)',
    generated: new Date().toISOString().slice(0, 10),
  },
  items,
  recipes,
  machines: MACHINES,
  mining: MINING,
  proliferator: PROLIFERATOR,
  belts: BELTS,
  veins,
  gasGiants,
  oceanItems: [...WATER_ITEMS.keys()],
  waterItemId: 1000,
  sulfuricAcidItemId: 1116,
  crudeOilItemId: 1007,
};

mkdirSync(OUT, { recursive: true });
writeFileSync(OUT + 'dsp-data.json', JSON.stringify(dataset));
console.log(`Wrote ${OUT}dsp-data.json (${(JSON.stringify(dataset).length / 1024).toFixed(0)} KB)`);

// sanity summary
const nameById = new Map(items.map((i) => [i.id, i.name]));
const nRecipes = recipes.length;
console.log(`items: ${items.length}, recipes: ${nRecipes}, techs: ${techsRaw.length}`);
const missingZh = items.filter((i) => !i.zh).map((i) => i.name);
console.log('items missing Chinese name:', JSON.stringify(missingZh, null, 2));
const missingRecipeZh = recipes.filter((r) => !r.zh).map((r) => r.name);
console.log('recipes missing Chinese name:', JSON.stringify(missingRecipeZh, null, 2));
const noRecipeItems = items.filter((i) => i.recipesMaking.length === 0 && i.category !== 'resource' && i.category !== 'darkfog' && i.category !== 'other');
console.log('non-resource items without recipe:', noRecipeItems.map((i) => i.name));
// recipe machine types sanity
const typeCount = {};
for (const r of recipes) typeCount[r.machine] = (typeCount[r.machine] || 0) + 1;
console.log('recipe machine types:', typeCount);
// every recipe ingredient must exist
const bad = recipes.filter((r) => r.in.some(([id]) => !itemById.has(id)));
console.log('recipes with unknown ingredients:', bad.map((r) => r.name));
// item Type distribution
const tDist = {};
for (const i of itemsRaw) tDist[i.Type] = (tDist[i.Type] || 0) + 1;
console.log('item Type distribution:', tDist);

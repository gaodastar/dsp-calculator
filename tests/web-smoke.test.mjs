// Web UI smoke test with a minimal DOM stub — catches reference errors in app.js
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createEngine } from '../src/engine.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const dataset = JSON.parse(readFileSync(ROOT + 'data/dsp-data.json', 'utf8'));
const engine = createEngine(dataset);

// ---- minimal DOM stub ----
function makeEl(tag = 'div') {
  const el = {
    tagName: tag.toUpperCase(),
    children: [],
    _innerHTML: '',
    style: {},
    dataset: {},
    value: '',
    checked: true,
    textContent: '',
    src: '',
    onerror: null,
    addEventListener() {},
    querySelectorAll() { return []; },
    querySelector(sel) {
      const key = '__q_' + sel;
      if (!el[key]) el[key] = makeEl(sel);
      return el[key];
    },
    appendChild(c) { el.children.push(c); return c; },
    set innerHTML(v) { el._innerHTML = v; },
    get innerHTML() { return el._innerHTML; },
    classList: { add() {}, remove() {} },
  };
  return el;
}

const els = new Map();
function getEl(id) {
  if (!els.has(id)) els.set(id, makeEl(id.includes('list') ? 'div' : 'div'));
  return els.get(id);
}
globalThis.window = { DSP_DATA: dataset };
globalThis.document = {
  getElementById: getEl,
  querySelectorAll: () => [],
  addEventListener() {},
};

// engine bundle (mirror of build-web output)
let engineSrc = readFileSync(ROOT + 'src/engine.mjs', 'utf8')
  .replace(/^export function createEngine/m, 'function createEngine')
  .replace(/^export \{ fmt \};\s*$/m, '')
  + '\nwindow.createEngine = createEngine;';
(0, eval)(engineSrc);

// data.js equivalent
globalThis.window.DSP_DATA = dataset;

// app.js
let appSrc = readFileSync(ROOT + 'web/app.js', 'utf8');
(0, eval)(appSrc);

// verify the render pipeline produced actual content (init() ran inside app.js)
const tbody = getEl('t-factories').querySelector('tbody');
if (!tbody._innerHTML || tbody._innerHTML.length < 100) throw new Error('factories table empty');
if (!tbody._innerHTML.includes('Universe Matrix')) throw new Error('universe matrix row missing');
const summary = getEl('summary');
if (!summary._innerHTML.includes('总电力')) throw new Error('summary missing');
const rawTbody = getEl('t-raw').querySelector('tbody');
if (!rawTbody._innerHTML || rawTbody._innerHTML.length < 50) throw new Error('raw materials table empty');
const listHtml = getEl('item-list')._innerHTML;
if (!listHtml.includes('宇宙矩阵')) throw new Error('item list missing zh names');
console.log('render pipeline: factories/raw/summary/item-list all populated');

// simulate interactions
const rateInput = getEl('rate');
rateInput.value = '60';
const inputs = ['m-smelt', 'm-assemble', 'm-chemical', 'm-research', 'm-mining', 'm-prolif',
  'm-prolif-mode', 'm-selfspray', 'm-veins', 'm-oil', 'm-fbelt', 'm-fstack', 'm-lens'];
for (const id of inputs) getEl(id).value = getEl(id).value || '1';

// exercise the compute path across a few targets
const state = { rate: 60 };
const targets = ['Iron Ingot', 'Universe Matrix', 'Antimatter Fuel Rod', 'Deuterium', 'Solar Sail', 'Strange Annihilation Fuel Rod'];
for (const name of targets) {
  const item = dataset.items.find((i) => i.name === name);
  const r = engine.computeChainWithProliferator({
    target: { itemId: item.id, ratePerMin: state.rate },
    proliferator: { tier: 3, mode: 'extra' },
  });
  if (!r.result.recipes.length) throw new Error(`${name}: no recipes`);
  console.log(`  ✓ ${item.zh || name} x60/min: ${r.result.recipes.length} 配方, ${r.result.power.totalMW.toFixed(1)} MW`);
}
console.log('web smoke: app.js loaded and core flows exercised without reference errors');

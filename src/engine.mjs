// DSP production-chain calculation engine.
// Pure functions over the dataset built from dsp-wiki.com data.
// Units: rates in items/minute (user facing), internally items/second.
// All recipe times in seconds; machine speeds are multipliers of base craft speed.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n, digits = 3) {
  if (!isFinite(n)) return '∞';
  if (Math.abs(n) >= 1000) return n.toFixed(0);
  if (Math.abs(n) >= 100) return n.toFixed(1);
  if (Math.abs(n) >= 10) return n.toFixed(2);
  if (Math.abs(n) >= 1) return n.toFixed(2);
  return n.toPrecision(digits);
}

// ---------------------------------------------------------------------------
// Default production-method choices for ambiguous items.
// 'recipe:<id>' | 'source:vein' | 'source:ocean' | 'source:gas' | 'source:oil' | 'source:photon'
// ---------------------------------------------------------------------------

const DEFAULT_CHOICES = {
  // resources with both veins and recipes
  'Silicon Ore': 'source:vein',
  'Organic Crystal': 'source:vein',
  'Fire Ice': 'source:vein',
  'Kimberlite Ore': 'source:vein',
  'Fractal Silicon': 'source:vein',
  'Grating Crystal': 'source:vein',
  'Stalagmite Crystal': 'source:vein',
  'Unipolar Magnet': 'source:vein',
  // fluids / gases
  Water: 'source:ocean',
  'Sulfuric Acid': 'source:ocean',
  Hydrogen: 'source:gas',
  'Crude Oil': 'source:oil',
  // deuterium: fractionation is the dominant mid/late-game method
  Deuterium: 'recipe:115',
  'Critical Photon': 'source:photon',
  // dark-fog / special items have no production
  'Accumulator (full)': 'external',
};

const PROLIFERABLE_MACHINES = new Set(['Smelt', 'Assemble', 'Refine', 'Chemical', 'Particle', 'Research']);

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export function createEngine(dataset) {
  const items = new Map(dataset.items.map((i) => [i.id, i]));
  const itemsByName = new Map(dataset.items.map((i) => [i.name, i]));
  const recipes = new Map(dataset.recipes.map((r) => [r.id, r]));
  const recipesByName = new Map(dataset.recipes.map((r) => [r.name, r]));
  const recipesMaking = new Map(); // itemId -> recipe[]
  const recipesUsing = new Map();  // itemId -> recipe[]
  for (const r of dataset.recipes) {
    for (const [outId] of r.out) {
      if (!recipesMaking.has(outId)) recipesMaking.set(outId, []);
      recipesMaking.get(outId).push(r);
    }
    for (const [inId] of r.in) {
      if (!recipesUsing.has(inId)) recipesUsing.set(inId, []);
      recipesUsing.get(inId).push(r);
    }
  }
  const veins = new Map(dataset.veins.map((v) => [v.itemId, v]));
  const gasWeights = new Map(); // itemId -> weight (first matching giant)
  for (const g of dataset.gasGiants) {
    for (const { itemId, weight } of g.gases) {
      if (!gasWeights.has(itemId)) gasWeights.set(itemId, weight);
    }
  }
  const veinNames = new Map(dataset.veins.map((v) => [v.itemId, v]));
  const machineTypes = dataset.machines;
  const proliferators = dataset.proliferator;
  const belts = dataset.belts;

  function itemById(id) { return items.get(id); }
  function recipeById(id) { return recipes.get(id); }

  // Resolve the production choice for one item.
  function resolveChoice(item, opts, choices) {
    if (choices[item.id]) return choices[item.id];
    const byName = DEFAULT_CHOICES[item.name];
    if (byName) {
      if (byName === 'external') return { kind: 'external' };
      if (byName.startsWith('source:')) return { kind: 'source', source: byName.slice(7) };
      if (byName.startsWith('recipe:')) return { kind: 'recipe', recipeId: Number(byName.slice(7)) };
    }
    // 1. a recipe whose name equals the item name
    const making = recipesMaking.get(item.id) || [];
    const named = making.filter((r) => r.name === item.name);
    if (named.length) return { kind: 'recipe', recipeId: named.sort((a, b) => a.id - b.id)[0].id };
    // 2. natural sources
    const src = naturalSource(item);
    if (src) return { kind: 'source', source: src };
    // 3. any recipe
    if (making.length) return { kind: 'recipe', recipeId: making.sort((a, b) => a.id - b.id)[0].id };
    return { kind: 'external' };
  }

  function naturalSource(item) {
    if (veins.has(item.id)) return 'vein';
    if (item.id === dataset.waterItemId || item.id === dataset.sulfuricAcidItemId) return 'ocean';
    if (gasWeights.has(item.id)) return 'gas';
    if (item.id === dataset.crudeOilItemId) return 'oil';
    return null;
  }

  // Expand the chain: every item gets a resolved choice.
  function expandChain(target, opts, choices) {
    const chosen = {}; // itemId -> choice
    const stack = [itemById(target.itemId)];
    const visited = new Set();
    while (stack.length) {
      const item = stack.pop();
      if (visited.has(item.id)) continue;
      visited.add(item.id);
      const choice = resolveChoice(item, opts, choices);
      chosen[item.id] = choice;
      if (choice.kind === 'recipe') {
        const r = recipeById(choice.recipeId);
        for (const [inId] of r.in) stack.push(itemById(inId));
      }
    }
    return chosen;
  }

  // Does a recipe participate in proliferator bonuses?
  function proliferated(opts) {
    return opts.proliferator && opts.proliferator.tier > 0;
  }

  function extraMult(opts) {
    // extra-products multiplier applied to recipe outputs
    return opts.proliferator.mode === 'extra' ? 1 + proliferators[opts.proliferator.tier].extra : 1;
  }

  function speedMult(opts) {
    return opts.proliferator.mode === 'speed' ? 1 + proliferators[opts.proliferator.tier].speedup : 1;
  }

  function energyPenalty(opts) {
    return 1 + proliferators[opts.proliferator.tier].energy;
  }

  // Solve the linear system for recipe rates (crafts/second).
  // equations: for every item with a chosen recipe:
  //   Σ out*R*mult − Σ in*R = targetRate/sec
  // Sources and external items get no equation.
  // offsets: Map itemId -> extra production rate (per minute) already provided
  //          by extraction byproducts (gas giant co-gases), subtracted from demand.
  function solveRates(chosen, targets, opts, offsets = null) {
    const varList = [];
    const varIndex = new Map();
    for (const choice of Object.values(chosen)) {
      if (choice.kind === 'recipe' && !varIndex.has(choice.recipeId)) {
        varIndex.set(choice.recipeId, varList.length);
        varList.push(choice.recipeId);
      }
    }
    const n = varList.length;
    // equations: itemId -> target rate per second
    const targetSec = new Map(targets.map((t) => [t.itemId, t.ratePerMin / 60]));
    const eqItems = [...Object.keys(chosen)]
      .map(Number)
      .filter((id) => chosen[id].kind === 'recipe')
      .sort((a, b) => a - b);
    const m = eqItems.length;
    if (m !== n) {
      const names = eqItems.map((id) => itemById(id).name);
      throw new Error(
        `所选配方组合方程数(${m})与变量数(${n})不一致，涉及物品: ${names.join(', ')}。` +
        '请检查是否为多个物品选择了同一个配方，或为联产物选择了会相互冲突的生产方式。'
      );
    }
    const A = Array.from({ length: n }, () => new Array(n).fill(0));
    const b = new Array(n).fill(0);
    const mult = proliferated(opts) ? extraMult(opts) : 1;

    for (let row = 0; row < m; row++) {
      const itemId = eqItems[row];
      // production terms
      for (const r of recipesMaking.get(itemId) || []) {
        const vi = varIndex.get(r.id);
        if (vi === undefined) continue;
        const outCount = r.out.find(([id]) => id === itemId)[1];
        let m2 = mult;
        if (proliferated(opts) && (r.nonProductive || r.machine === 'Fractionate')) m2 = 1; // only speedup applies
        A[row][vi] += outCount * m2;
      }
      // consumption terms
      for (const r of recipesUsing.get(itemId) || []) {
        const vi = varIndex.get(r.id);
        if (vi === undefined) continue;
        let inCount = r.in.find(([id]) => id === itemId)[1];
        if (r.machine === 'Fractionate') {
          // 1% per-pass conversion; the loop recycles hydrogen, so the NET
          // consumption is 1 hydrogen per deuterium (dsp-wiki.com/Fractionator).
          inCount = 1;
        }
        A[row][vi] -= inCount;
      }
      b[row] = (targetSec.get(itemId) || 0) - (offsets ? (offsets.get(itemId) || 0) / 60 : 0);
    }

    const x = gaussianSolve(A, b);
    const rates = new Map();
    for (let i = 0; i < n; i++) {
      if (x[i] < -1e-9) {
        const r = recipeById(varList[i]);
        throw new Error(
          `配方组合不可行: 配方「${r.name}」解得负速率 (${fmt(x[i])}/s)。` +
          '这通常意味着所选生产方式之间存在循环依赖且无法满足目标，请尝试更换某个物品的生产方式。'
        );
      }
      rates.set(varList[i], Math.max(0, x[i]));
    }
    return { rates, varList };
  }

  function gaussianSolve(A, b) {
    const n = A.length;
    const M = A.map((row, i) => [...row, b[i]]);
    for (let col = 0; col < n; col++) {
      // partial pivot
      let piv = col;
      for (let r = col + 1; r < n; r++) {
        if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
      }
      if (Math.abs(M[piv][col]) < 1e-12) throw new Error('线性方程组奇异: 所选配方组合无法确定唯一解。');
      [M[col], M[piv]] = [M[piv], M[col]];
      const d = M[col][col];
      for (let j = col; j <= n; j++) M[col][j] /= d;
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const f = M[r][col];
        if (Math.abs(f) < 1e-15) continue;
        for (let j = col; j <= n; j++) M[r][j] -= f * M[col][j];
      }
    }
    return M.map((row) => row[n]);
  }

  // Machine choice for a recipe machine type.
  const DEFAULT_VARIANTS = { Smelt: 'Arc Smelter', Assemble: 'Assembling Machine Mk.III', Refine: 'Oil Refinery', Chemical: 'Chemical Plant', Particle: 'Miniature Particle Collider', Research: 'Matrix Lab', Fractionate: 'Fractionator' };
  function machineFor(type, opts) {
    const sel = opts.machines?.[type] || DEFAULT_VARIANTS[type] || dataset.machines[type].variants[0].name;
    return dataset.machines[type].variants.find((v) => v.name === sel) || dataset.machines[type].variants[0];
  }

  // Extraction pseudo-machines
  function extractionMachines(sourceKind, itemId, ratePerMin, opts) {
    const miningRate = opts.mineVeinsPerMiner ?? 1;
    switch (sourceKind) {
      case 'vein': {
        const m = opts.miningMachine === 'Advanced Mining Machine'
          ? dataset.mining['Advanced Mining Machine']
          : dataset.mining['Mining Machine'];
        const perMachine = m.ratePerMin * miningRate;
        const machines = Math.ceil(ratePerMin / perMachine - 1e-9);
        return {
          machineName: opts.miningMachine === 'Advanced Mining Machine' ? 'Advanced Mining Machine' : 'Mining Machine',
          machines,
          perMachine,
          powerMW: (machines * m.power) / 1000,
          note: `${veinNames.get(itemId)?.zh || veinNames.get(itemId)?.name || ''} · 每台覆盖 ${miningRate} 条矿脉`,
        };
      }
      case 'ocean': {
        const m = dataset.mining['Water Pump'];
        const machines = Math.ceil(ratePerMin / m.ratePerMin - 1e-9);
        return { machineName: 'Water Pump', machines, perMachine: m.ratePerMin, powerMW: (machines * m.power) / 1000, note: '' };
      }
      case 'gas': {
        const m = dataset.mining['Orbital Collector'];
        const weight = gasWeights.get(itemId) ?? 1;
        const perMachine = m.ratePerMin * weight;
        const machines = Math.ceil(ratePerMin / perMachine - 1e-9);
        return { machineName: 'Orbital Collector', machines, perMachine, powerMW: (machines * m.power) / 1000, note: '采集自气巨星（按 wiki 基础 8/分钟 × 气种权重）' };
      }
      case 'oil': {
        const m = dataset.mining['Oil Extractor'];
        const perMachine = opts.oilYieldPerMin ?? 120;
        const machines = Math.ceil(ratePerMin / perMachine - 1e-9);
        return { machineName: 'Oil Extractor', machines, perMachine, powerMW: (machines * m.power) / 1000, note: `默认渗出点产量 ${perMachine}/分钟（可调）` };
      }
      case 'photon': {
        const perMachine = opts.photonLens ? 12 : 6;
        const machines = Math.ceil(ratePerMin / perMachine - 1e-9);
        const sphereMW = machines * (opts.photonLens ? 240 : 120);
        return {
          machineName: 'Ray Receiver',
          machines,
          perMachine,
          powerMW: 0,
          sphereLoadMW: sphereMW,
          note: opts.photonLens ? '加装引力透镜: 12光子/分钟 · 240MW 戴森球负载' : '光子模式: 6光子/分钟 · 120MW 戴森球负载',
        };
      }
      default:
        return { machineName: sourceKind, machines: 0, perMachine: 0, powerMW: 0, note: '' };
    }
  }

  function fractionatorCount(deuteriumRatePerMin, opts) {
    const belt = belts.find((b) => b.name === opts.fractionBelt) || belts[2];
    const stack = opts.fractionStack ?? 1;
    const speedup = proliferated(opts) ? proliferators[opts.proliferator.tier].speedup : 0;
    const perMachine = 0.01 * (1 + speedup) * belt.perMin * stack;
    if (perMachine <= 0) return { machines: 0, perMachine: 0, powerMW: 0 };
    const machines = Math.ceil(deuteriumRatePerMin / perMachine - 1e-9);
    // wiki: 720 kW up to 18 D2/min, above: 0.06*(D2/min - 6) MW per machine
    const perMachineD2 = deuteriumRatePerMin / machines;
    const baseMW = perMachineD2 <= 18 ? 0.72 : 0.06 * (perMachineD2 - 6);
    const penalty = proliferated(opts) ? energyPenalty(opts) : 1;
    return { machines, perMachine, powerMW: machines * baseMW * penalty, belt: belt.name, stack };
  }

  // Compute the full chain for a list of targets. Returns a result object.
  function computeChain(opts) {
    opts = normalizeOpts(opts);
    const targets = opts.targets && opts.targets.length ? opts.targets : [opts.target];
    const targetMap = new Map(targets.map((t) => [t.itemId, t.ratePerMin]));
    // expand the chain for every target
    const chosen = {};
    for (const t of targets) {
      Object.assign(chosen, expandChain(t, opts, opts.recipeChoices || {}));
    }

    const machineSpeed = proliferated(opts) ? speedMult(opts) : 1;
    const penalty = proliferated(opts) ? energyPenalty(opts) : 1;
    const outMult = proliferated(opts) ? extraMult(opts) : 1;

    // ---- recipe rows & item flows for a given solve ----
    function buildFlows(rates) {
      const produced = new Map();
      const consumed = new Map();
      const rows = [];
      const power = { totalMW: 0, idleMW: 0 };
      const recipeVarIds = [...rates.keys()].sort((a, b) => a - b);
      for (const recipeId of recipeVarIds) {
        const r = recipeById(recipeId);
        const rateSec = rates.get(recipeId);
        const craftsPerMin = rateSec * 60;
        const m2 = proliferated(opts) && !r.nonProductive && r.machine !== 'Fractionate' ? outMult : 1;
        let row;
        if (r.machine === 'Fractionate') {
          const fc = fractionatorCount(craftsPerMin, opts);
          row = {
            recipeId, name: r.name, machine: r.machine, machineName: 'Fractionator', machineZh: '分馏塔',
            craftsPerMin, machinesExact: fc.machines, machines: fc.machines,
            powerMW: fc.powerMW, belt: fc.belt, stack: fc.stack,
            // net hydrogen consumption is 1:1 with deuterium output (loop recycling)
            in: r.in.map(([id]) => ({ itemId: id, perMin: rateSec * m2 * 60 })),
            out: r.out.map(([id, c]) => ({ itemId: id, perMin: rateSec * c * m2 * 60 })),
            tech: r.tech,
            note: '分馏塔环路: 氢净消耗 = 重氢产量 (1:1)，单次通过转化率 1%',
          };
        } else {
          const m = machineFor(r.machine, opts);
          const speed = m.speed * machineSpeed;
          const machinesExact = (rateSec * r.time) / speed;
          const machines = Math.ceil(machinesExact - 1e-9);
          const powerMW = (machines * m.power * penalty) / 1000;
          row = {
            recipeId, name: r.name, machine: r.machine, machineName: m.name, machineZh: m.zh,
            craftsPerMin, machinesExact, machines, powerMW, idleMW: (machines * m.idle) / 1000,
            in: r.in.map(([id, c]) => ({ itemId: id, perMin: rateSec * c * 60 })),
            out: r.out.map(([id, c]) => ({ itemId: id, perMin: rateSec * c * m2 * 60 })),
            tech: r.tech,
          };
          power.idleMW += row.idleMW || 0;
        }
        for (const [id, c] of r.in) {
          const rate = r.machine === 'Fractionate' ? rateSec * 60 : rateSec * c * 60;
          consumed.set(id, (consumed.get(id) || 0) + rate);
        }
        for (const [id, c] of r.out) {
          produced.set(id, (produced.get(id) || 0) + rateSec * c * m2 * 60);
        }
        rows.push(row);
        power.totalMW += row.powerMW;
      }
      return { rows, produced, consumed, power };
    }

    // ---- extraction planning ----
    // Gas giants are grouped: one collector gathers every gas type of its giant,
    // so collector counts and co-gas byproducts are computed jointly.
    function planExtraction(produced, consumed) {
      const rows = [];
      const collected = new Map(); // itemId -> perMin collected from giants
      let powerMW = 0;
      let sphereMW = 0;
      const giantNeeds = new Map();
      for (const [itemIdStr, choice] of Object.entries(chosen)) {
        const itemId = Number(itemIdStr);
        if (choice.kind !== 'source') continue;
        const targetNeed = targetMap.get(itemId) || 0;
        const need = (consumed.get(itemId) || 0) - (produced.get(itemId) || 0) + targetNeed;
        if (need <= 1e-9) continue;
        if (choice.source === 'gas') {
          const giant = dataset.gasGiants.find((g) => g.gases.some((x) => x.itemId === itemId));
          if (!giant) continue;
          if (!giantNeeds.has(giant.name)) giantNeeds.set(giant.name, { giant, needs: new Map() });
          giantNeeds.get(giant.name).needs.set(itemId, need);
        } else {
          const ext = extractionMachines(choice.source, itemId, need, opts);
          rows.push({
            itemId, sourceKind: choice.source, perMin: need,
            machineName: ext.machineName, machineZh: dataset.mining[ext.machineName]?.zh || ext.machineName,
            machines: ext.machines, perMachine: ext.perMachine, powerMW: ext.powerMW, note: ext.note,
          });
          powerMW += ext.powerMW;
          if (ext.sphereLoadMW) sphereMW += ext.sphereLoadMW;
        }
      }
      const collectorRate = dataset.mining['Orbital Collector'].ratePerMin; // 8/min per gas type
      for (const { giant, needs } of giantNeeds.values()) {
        let collectors = 0;
        for (const [itemId, need] of needs) {
          const w = giant.gases.find((g) => g.itemId === itemId)?.weight ?? 1;
          collectors = Math.max(collectors, Math.ceil(need / (collectorRate * w) - 1e-9));
        }
        if (collectors === 0) continue;
        const items = giant.gases.map((g) => ({ itemId: g.itemId, perMin: collectors * collectorRate * g.weight }));
        for (const x of items) collected.set(x.itemId, (collected.get(x.itemId) || 0) + x.perMin);
        rows.push({
          sourceKind: 'gas', giantName: giant.name, machineName: 'Orbital Collector',
          machineZh: '轨道采集器', machines: collectors, items,
          powerMW: 0, // collectors burn collected fuel; no grid draw
          note: '每台采集器同步采集该气巨星所有气种（wiki 基础 8/分钟 × 气种权重），自供电不占电网',
        });
      }
      return { rows, collected, powerMW, sphereMW };
    }

    // ---- iterate: linear solve <-> gas-giant byproduct offsets ----
    let offsets = new Map();
    let rates = null;
    let flows = null;
    let ext = null;
    for (let iter = 0; iter < 10; iter++) {
      rates = solveRates(chosen, targets, opts, offsets).rates;
      flows = buildFlows(rates);
      ext = planExtraction(flows.produced, flows.consumed);
      const next = new Map();
      for (const [itemId, amount] of ext.collected) {
        if (chosen[itemId]?.kind === 'recipe') next.set(itemId, amount);
      }
      const same = next.size === offsets.size &&
        [...next].every(([k, v]) => Math.abs(v - (offsets.get(k) || 0)) < 1e-9);
      offsets = next;
      if (same) break;
    }

    const result = {
      targets: targets.map((t) => ({ ...t, item: itemById(t.itemId) })),
      target: { ...targets[0], item: itemById(targets[0].itemId) },
      settings: opts,
      recipes: flows.rows,
      extraction: ext.rows,
      rawMaterials: [],
      external: [],
      surplus: [],
      items: [],
      proliferator: null,
      power: {
        totalMW: flows.power.totalMW + ext.powerMW,
        idleMW: flows.power.idleMW,
        dysonSphereLoadMW: ext.sphereMW,
      },
      warnings: [],
    };

    // ---- external supply rows ----
    for (const [itemIdStr, choice] of Object.entries(chosen)) {
      const itemId = Number(itemIdStr);
      if (choice.kind !== 'external') continue;
      const targetNeed = targetMap.get(itemId) || 0;
      const net = (flows.consumed.get(itemId) || 0) - (flows.produced.get(itemId) || 0) + targetNeed;
      if (net > 1e-9) result.external.push({ itemId, perMin: net });
    }

    // ---- raw material summary (natural sources, incl. byproduct offsets) ----
    for (const item of dataset.items) {
      const cons = flows.consumed.get(item.id) || 0;
      const prod = flows.produced.get(item.id) || 0;
      const choice = chosen[item.id];
      const targetNeed = targetMap.get(item.id) || 0;
      if (choice?.kind === 'recipe') continue; // intermediate, not raw
      if (choice?.kind === 'external') continue; // listed separately
      const need = cons - prod + targetNeed;
      const isSource = choice?.kind === 'source';
      if (isSource && choice.source === 'gas') {
        const got = ext.collected.get(item.id) || 0;
        const net = need - got;
        if (net > 1e-9) result.rawMaterials.push({ itemId: item.id, perMin: net, sourceKind: 'gas' });
        else if (net < -1e-9) result.surplus.push({ itemId: item.id, perMin: -net, note: '气巨星采集超出消耗（同台采集器副产）' });
      } else if (isSource) {
        if (need > 1e-9) result.rawMaterials.push({ itemId: item.id, perMin: need, sourceKind: choice.source });
        else if (need < -1e-9) result.surplus.push({ itemId: item.id, perMin: -need, note: '来源为联产副产物，超出消耗' });
      } else if (!isSource) {
        if (prod > 1e-9 && cons <= 1e-9) {
          result.surplus.push({ itemId: item.id, perMin: prod, note: '联产副产物，无消耗（可回收/燃烧）' });
        } else if (cons > 1e-9 && prod <= 1e-9) {
          result.external.push({ itemId: item.id, perMin: cons });
        }
      }
    }

    // ---- item-level rates table (includes collector output) ----
    for (const item of dataset.items) {
      const cons = flows.consumed.get(item.id) || 0;
      const prod = flows.produced.get(item.id) || 0;
      const got = ext.collected.get(item.id) || 0;
      if (cons <= 1e-9 && prod <= 1e-9 && got <= 1e-9) continue;
      result.items.push({ itemId: item.id, producedPerMin: prod + got, consumedPerMin: cons, netPerMin: prod + got - cons });
    }
    result.items.sort((a, b) => b.netPerMin - a.netPerMin);

    return result;
  }

  // Proliferator demand: fixed-point over the proliferator's own chain.
  function computeChainWithProliferator(opts) {
    opts = normalizeOpts(opts);
    if (!proliferated(opts)) return { result: computeChain(opts), proliferator: null };

    const tier = opts.proliferator.tier;
    const pItem = itemsByName.get(`Proliferator Mk.${['I', 'II', 'III'][tier - 1]}`);
    const spraysPerItem = proliferators[tier].sprays
      * (opts.selfSpray && opts.proliferator.mode === 'extra' ? 1 + proliferators[tier].extra : 1);

    let pRate = 0;
    let result = null;
    for (let iter = 0; iter < 15; iter++) {
      const targets = [{ itemId: opts.target.itemId, ratePerMin: opts.target.ratePerMin }];
      if (pRate > 0) targets.push({ itemId: pItem.id, ratePerMin: pRate });
      result = computeChain({ ...opts, targets });
      // sprays = every input item of every proliferated recipe (per minute)
      let sprayed = 0;
      for (const row of result.recipes) {
        const r = recipeById(row.recipeId);
        if (PROLIFERABLE_MACHINES.has(r.machine) || r.machine === 'Fractionate') {
          sprayed += row.in.reduce((s, x) => s + x.perMin, 0);
        }
      }
      const pNew = sprayed / spraysPerItem;
      if (pRate > 0 && Math.abs(pNew - pRate) / pRate < 0.002) { pRate = pNew; break; }
      pRate = pNew;
    }
    // final solve with converged proliferator rate
    const targets = [{ itemId: opts.target.itemId, ratePerMin: opts.target.ratePerMin }];
    if (pRate > 0) targets.push({ itemId: pItem.id, ratePerMin: pRate });
    result = computeChain({ ...opts, targets });

    // split out proliferator-related rows
    const pRows = [];
    const pRelated = new Set();
    const pChain = expandChain({ itemId: pItem.id, ratePerMin: pRate }, opts, opts.recipeChoices || {});
    for (const [id, choice] of Object.entries(pChain)) {
      pRelated.add(Number(id));
      if (choice.kind === 'recipe') pRelated.add(choice.recipeId);
    }
    for (const row of [...result.recipes]) {
      if (pRelated.has(row.recipeId) || row.in.some((x) => pRelated.has(x.itemId))) pRows.push(row);
    }
    result.proliferator = {
      itemId: pItem.id, tier, mode: opts.proliferator.mode,
      perMin: pRate, spraysPerMin: pRate * spraysPerItem,
      spraysPerItem,
      rows: pRows,
    };
    return { result, proliferator: result.proliferator };
  }

  function normalizeOpts(opts) {
    return {
      targets: opts.targets || [opts.target],
      target: opts.target,
      recipeChoices: opts.recipeChoices || {},
      machines: opts.machines || {},
      proliferator: opts.proliferator || { tier: 0, mode: 'extra' },
      selfSpray: opts.selfSpray !== false,
      mineVeinsPerMiner: opts.mineVeinsPerMiner ?? 1,
      miningMachine: opts.miningMachine || 'Mining Machine',
      oilYieldPerMin: opts.oilYieldPerMin ?? 120,
      fractionBelt: opts.fractionBelt || 'Conveyor Belt Mk.III',
      fractionStack: opts.fractionStack ?? 1,
      photonLens: !!opts.photonLens,
    };
  }

  // production options for an item (for the UI)
  function optionsForItem(itemId) {
    const item = itemById(itemId);
    const out = [];
    for (const r of recipesMaking.get(itemId) || []) {
      out.push({ kind: 'recipe', label: recipeLabel(r), recipeId: r.id, description: recipeDesc(r) });
    }
    if (veins.has(itemId)) {
      const v = veins.get(itemId);
      out.push({ kind: 'source', source: 'vein', label: `矿脉采集 · ${v.zh || v.name}`, description: '采矿机 / 大型采矿机从矿脉开采' });
    }
    if (item.id === dataset.waterItemId || item.id === dataset.sulfuricAcidItemId) {
      out.push({ kind: 'source', source: 'ocean', label: '抽水站采集', description: '从海洋/湖泊泵取' });
    }
    if (gasWeights.has(itemId)) {
      out.push({ kind: 'source', source: 'gas', label: '轨道采集器（气巨星）', description: '从气巨星采集' });
    }
    if (item.id === dataset.crudeOilItemId) {
      out.push({ kind: 'source', source: 'oil', label: '原油萃取站', description: '从原油渗出点萃取' });
    }
    if (item.name === 'Critical Photon') {
      out.push({ kind: 'source', source: 'photon', label: '射线接收站（光子模式）', description: '6/分钟（加引力透镜 12/分钟）' });
    }
    if (out.length === 0) out.push({ kind: 'external', label: '外部供应', description: '无法生产（黑雾掉落等）' });
    return out;
  }

  function recipeLabel(r) {
    const ins = r.in.map(([id, c]) => `${itemById(id).zh || itemById(id).name}×${c}`).join(' + ');
    const outs = r.out.map(([id, c]) => `${itemById(id).zh || itemById(id).name}×${c}`).join(' + ');
    const mz = dataset.machines[r.machine]?.zh || r.machine;
    const zh = r.zh || r.name;
    return `${zh} · ${mz}: ${ins} → ${outs} (${r.time}s)`;
  }

  function recipeDesc(r) {
    return r.tech ? `解锁科技: ${r.tech}` : '';
  }

  return {
    dataset,
    itemById,
    itemByName: (n) => itemsByName.get(n),
    recipeById,
    computeChain,
    computeChainWithProliferator,
    optionsForItem,
    resolveChoice,
    naturalSource,
    fmt,
    machineTypes,
    proliferators,
    belts,
  };
}

export { fmt };

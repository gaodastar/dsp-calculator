/* 戴森球计划 · 产量量化计算器 — 前端逻辑 */
'use strict';

const DATA = window.DSP_DATA;
const engine = window.createEngine(DATA);
const fmt = engine.fmt;

const CATEGORIES = [
  { key: 'resource', label: '资源', icon: '⛏' },
  { key: 'component', label: '组件', icon: '⚙' },
  { key: 'building', label: '建筑', icon: '🏭' },
  { key: 'matrix', label: '矩阵', icon: '🔬' },
  { key: 'darkfog', label: '黑雾', icon: '👾' },
  { key: 'other', label: '其他', icon: '📦' },
];
const CAT_ORDER = CATEGORIES.map((c) => c.key);

const state = {
  itemId: null,
  rate: 60,
  machines: {},
  proliferator: { tier: 0, mode: 'extra' },
  selfSpray: true,
  veinsPerMiner: 1,
  miningMachine: 'Mining Machine',
  oilYield: 120,
  fractionBelt: 'Conveyor Belt Mk.III',
  fractionStack: 4,
  photonLens: false,
  recipeChoices: {},
  search: '',
};

const $ = (id) => document.getElementById(id);
const itemById = (id) => engine.itemById(id);

function iconSrc(item) {
  return 'icons/' + item.name.replace(/[^A-Za-z0-9.()\-]/g, '_') + '.png';
}
function iconHtml(item, cls) {
  return `<img class="${cls || ''}" src="${iconSrc(item)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`;
}
function itemLabel(item, showEn = true) {
  return `${iconHtml(item)}<span>${item.zh || item.name}</span>` +
    (showEn ? `<span class="muted">${item.name !== item.zh ? item.name : ''}</span>` : '');
}

/* ---------------- sidebar: browse-first item catalog ---------------- */
function filteredItems() {
  const q = state.search.trim().toLowerCase();
  return DATA.items.filter((i) => {
    if (!q) return true;
    return i.name.toLowerCase().includes(q) || (i.zh && i.zh.includes(q));
  }).sort((a, b) => {
    const ca = CAT_ORDER.indexOf(a.category), cb = CAT_ORDER.indexOf(b.category);
    if (ca !== cb) return ca - cb;
    return (a.zh || a.name).localeCompare(b.zh || b.name, 'zh');
  });
}

function itemRowHtml(i) {
  return `
    <div class="item-row ${state.itemId === i.id ? 'active' : ''}" data-id="${i.id}" title="${escapeHtml(i.name)}">
      ${iconHtml(i)}
      <div>
        <div class="zh">${i.zh || i.name}</div>
        <div class="en">${i.name}</div>
      </div>
    </div>`;
}

function renderSidebar() {
  const list = $('item-list');
  const q = state.search.trim().toLowerCase();
  if (q) {
    const items = filteredItems();
    list.innerHTML = items.map(itemRowHtml).join('') ||
      '<div class="empty">没有匹配「' + escapeHtml(state.search) + '」的物品</div>';
  } else {
    // browse mode: grouped, collapsible sections; the selected item's section stays open
    list.innerHTML = CATEGORIES.map((g) => {
      const items = DATA.items
        .filter((i) => i.category === g.key)
        .sort((a, b) => (a.zh || a.name).localeCompare(b.zh || b.name, 'zh'));
      const open = items.some((i) => i.id === state.itemId);
      return `<details ${open ? 'open' : ''} data-group="${g.key}">
        <summary><span>${g.icon} ${g.label}</span><span class="count">${items.length}</span><span class="arrow">▶</span></summary>
        <div class="group-items">${items.map(itemRowHtml).join('')}</div>
      </details>`;
    }).join('');
  }
  list.querySelectorAll('.item-row').forEach((el) => el.addEventListener('click', () => {
    state.itemId = Number(el.dataset.id);
    // selection is a browse action: drop the search filter afterwards
    if (state.search) { state.search = ''; $('search').value = ''; }
    renderSidebar();
    renderTarget();
    renderDetail();
    compute();
  }));
}

/* ---------------- settings ---------------- */
function fillSelect(id, options, current) {
  const sel = $(id);
  sel.innerHTML = options.map((o) => `<option value="${o.value}" ${o.value === current ? 'selected' : ''}>${o.label}</option>`).join('');
}
function populateSettings() {
  for (const type of ['Smelt', 'Assemble', 'Chemical', 'Research']) {
    const variants = DATA.machines[type].variants;
    fillSelect('m-' + type.toLowerCase(),
      variants.map((v) => ({ value: v.name, label: v.zh + (v.speed !== 1 ? ` (${v.speed}x)` : '') })),
      state.machines[type] || variants[0].name);
  }
  fillSelect('m-mining', [
    { value: 'Mining Machine', label: '采矿机 (30/分·矿脉)' },
    { value: 'Advanced Mining Machine', label: '大型采矿机 (60/分·矿脉)' },
  ], state.miningMachine);
  fillSelect('m-prolif', [
    { value: 0, label: '不使用' },
    { value: 1, label: '增产剂 Mk.I (+25%速 / +12.5%量)' },
    { value: 2, label: '增产剂 Mk.II (+50%速 / +20%量)' },
    { value: 3, label: '增产剂 Mk.III (+100%速 / +25%量)' },
  ], String(state.proliferator.tier));
  fillSelect('m-fbelt', DATA.belts.map((b) => ({ value: b.name, label: `${b.zh} (${b.perMin}/分)` })), state.fractionBelt);
}

function readSettings() {
  state.machines = {
    Smelt: $('m-smelt').value,
    Assemble: $('m-assemble').value,
    Chemical: $('m-chemical').value,
    Research: $('m-research').value,
  };
  state.miningMachine = $('m-mining').value;
  state.proliferator = { tier: Number($('m-prolif').value), mode: $('m-prolif-mode').value };
  state.selfSpray = $('m-selfspray').checked;
  state.veinsPerMiner = Math.max(1, Number($('m-veins').value) || 1);
  state.oilYield = Math.max(6, Number($('m-oil').value) || 120);
  state.fractionBelt = $('m-fbelt').value;
  state.fractionStack = Number($('m-fstack').value);
  state.photonLens = $('m-lens').checked;
  state.rate = Math.max(0.001, Number($('rate').value) || 60);
}

/* ---------------- target card ---------------- */
function renderTarget() {
  const item = itemById(state.itemId);
  if (!item) return;
  $('target-icon').src = iconSrc(item);
  $('target-icon').onerror = () => { $('target-icon').style.visibility = 'hidden'; };
  $('target-name').textContent = item.zh || item.name;
  $('target-en').textContent = item.name;
}

/* ---------------- detail card ---------------- */
function renderDetail() {
  const item = itemById(state.itemId);
  if (!item) return;
  const card = $('detail-card');
  const opts = engine.optionsForItem(item.id);
  const current = state.recipeChoices[item.id] || defaultChoiceKey(item.id);
  const uses = DATA.recipes.filter((r) => r.in.some(([id]) => id === item.id));
  card.style.display = '';
  card.innerHTML = `
    <h2>${item.zh} (${item.name}) · 物品详情</h2>
    <div class="desc">${escapeHtml(item.description || '（无描述）')}</div>
    <div class="detail-grid">
      <div>
        <h3>生产方式（点击切换）</h3>
        ${opts.map((o) => {
          const key = optKey(o);
          return `<div class="opt-row" data-key="${key}">
            <input type="radio" name="target-opt" ${key === current ? 'checked' : ''}>
            <span>${escapeHtml(o.label)}</span>
            ${o.description ? `<span class="muted">${escapeHtml(o.description)}</span>` : ''}
          </div>`;
        }).join('')}
      </div>
      <div>
        <h3>用途（${uses.length} 条配方）</h3>
        ${uses.map((r) => `
          <div class="use-row">
            <b>${escapeHtml(r.zh || r.name)}</b>${r.zh && r.zh !== r.name ? ` <span class="muted">${escapeHtml(r.name)}</span>` : ''} <span class="muted">[${DATA.machines[r.machine]?.zh || r.machine}]</span><br>
            ${r.in.map(([id, c]) => `${itemById(id).zh || itemById(id).name}×${c}`).join(' + ')}
            <span class="arrow"> → </span>
            ${r.out.map(([id, c]) => `${itemById(id).zh || itemById(id).name}×${c}`).join(' + ')}
            <span class="muted">(${r.time}s${r.tech ? ' · ' + r.tech : ''})</span>
          </div>`).join('')}
      </div>
    </div>`;
  card.querySelectorAll('.opt-row').forEach((el) => el.addEventListener('click', () => {
    state.recipeChoices[item.id] = el.dataset.key;
    compute();
  }));
}

function defaultChoiceKey(itemId) {
  const choice = engine.resolveChoice(itemById(itemId), {}, {});
  return optKey(choice);
}
function optKey(o) {
  if (o.kind === 'recipe') return 'recipe:' + o.recipeId;
  if (o.kind === 'source') return 'source:' + o.source;
  return 'external';
}
function choiceFromKey(key) {
  if (!key) return undefined;
  const [kind, v] = key.split(':');
  if (kind === 'recipe') return { kind: 'recipe', recipeId: Number(v) };
  if (kind === 'source') return { kind: 'source', source: v };
  return { kind: 'external' };
}

/* ---------------- compute & render results ---------------- */
function compute() {
  readSettings();
  const banner = $('error-banner');
  banner.classList.add('hidden');
  if (!state.itemId) return;
  try {
    const r = engine.computeChainWithProliferator({
      target: { itemId: state.itemId, ratePerMin: state.rate },
      machines: state.machines,
      proliferator: state.proliferator,
      selfSpray: state.selfSpray,
      recipeChoices: mapChoices(),
      mineVeinsPerMiner: state.veinsPerMiner,
      miningMachine: state.miningMachine,
      oilYieldPerMin: state.oilYield,
      fractionBelt: state.fractionBelt,
      fractionStack: state.fractionStack,
      photonLens: state.photonLens,
    });
    renderResults(r);
  } catch (e) {
    banner.textContent = '⚠ 计算失败: ' + e.message;
    banner.classList.remove('hidden');
  }
}

function mapChoices() {
  const out = {};
  for (const [id, key] of Object.entries(state.recipeChoices)) {
    const c = choiceFromKey(key);
    if (c) out[id] = c;
  }
  return out;
}

function renderResults(r) {
  const { result } = r;
  renderSummary(result, r.proliferator);
  renderFactories(result);
  renderExtract(result);
  renderRaw(result);
  renderSurplus(result);
  renderExternal(result);
  renderFlow(result);
  renderOverrides(result);
}

function renderSummary(result, prolif) {
  const totalMachines = result.recipes.reduce((s, x) => s + x.machines, 0) +
    result.extraction.reduce((s, x) => s + x.machines, 0);
  const rawTotal = result.rawMaterials.reduce((s, x) => s + x.perMin, 0);
  const cards = [
    { cls: 'accent', k: '总电力', v: fmt(result.power.totalMW, 4) + ' <small>MW</small>',
      sub: `空载 ${fmt(result.power.idleMW, 4)} MW` },
    { cls: '', k: '生产设施总数', v: String(totalMachines), sub: '台（向上取整）' },
    { cls: 'green', k: '原材料总流量', v: fmt(rawTotal, 4) + ' <small>/分</small>',
      sub: `${result.rawMaterials.length} 种 + 外部 ${result.external.length} 种` },
    { cls: 'gold', k: '增殖剂需求',
      v: prolif ? fmt(prolif.perMin, 4) + ' <small>/分</small>' : '—',
      sub: prolif ? `喷涂量 ${fmt(prolif.spraysPerMin, 4)}/分` : '未使用增殖剂' },
  ];
  if (result.power.dysonSphereLoadMW > 0) {
    cards.push({ cls: 'gold', k: '戴森球负载', v: fmt(result.power.dysonSphereLoadMW, 4) + ' <small>MW</small>', sub: '射线接收站汲取' });
  }
  $('summary').innerHTML = cards.map((c) => `
    <div class="sum-card ${c.cls}"><div class="k">${c.k}</div><div class="v">${c.v}</div><div class="muted">${c.sub}</div></div>`).join('');
}

function renderFactories(result) {
  const tbody = $('t-factories').querySelector('tbody');
  tbody.innerHTML = result.recipes.map((row) => {
    const rec = DATA.recipes.find((x) => x.id === row.recipeId);
    const zh = rec?.zh || row.name;
    const enRef = rec && rec.zh && rec.name !== rec.zh ? rec.name + ' · ' : '';
    const ins = row.in.map((x) => {
      const it = itemById(x.itemId);
      return `<span class="inline-item" title="${it.name}" data-id="${it.id}">${iconHtml(it)}<span>${it.zh || it.name}</span><span>×${fmt(x.perMin)}</span></span>`;
    }).join(' ');
    const outs = row.out.map((x) => {
      const it = itemById(x.itemId);
      return `<span class="inline-item" title="${it.name}" data-id="${it.id}">${iconHtml(it)}<span>${it.zh || it.name}</span><span>×${fmt(x.perMin)}</span></span>`;
    }).join(' ');
    const machineCell = row.machine === 'Fractionate'
      ? `<span class="machine-badge">${row.machineZh}</span><div class="exact muted">${row.belt} · 堆叠×${row.stack}</div>`
      : `<span class="machine-badge">${row.machineZh}</span>`;
    return `<tr>
      <td><b>${escapeHtml(zh)}</b><div class="muted">${enRef}${fmt(row.craftsPerMin)} 次/分 · ${rec ? rec.time : ''}s${row.note ? ' · ' + row.note : ''}</div></td>
      <td>${ins} <span class="arrow">→</span> ${outs}</td>
      <td>${machineCell}</td>
      <td class="num"><b>${row.machines}</b><div class="exact">精确 ${fmt(row.machinesExact)}</div></td>
      <td class="num">${fmt(row.powerMW, 4)} MW</td>
      <td class="muted">${row.tech || ''}</td>
    </tr>`;
  }).join('');
  bindInlineItems(tbody);
}

function renderExtract(result) {
  const card = $('extract-card');
  const tbody = $('t-extract').querySelector('tbody');
  if (!result.extraction.length) { card.style.display = 'none'; tbody.innerHTML = ''; return; }
  card.style.display = '';
  tbody.innerHTML = result.extraction.map((e) => {
    if (e.sourceKind === 'gas') {
      const items = e.items.map((x) => {
        const it = itemById(x.itemId);
        return `<span class="inline-item" data-id="${it.id}">${iconHtml(it)}<span>${it.zh || it.name}</span><span>×${fmt(x.perMin)}</span></span>`;
      }).join(' ');
      const total = e.items.reduce((s, x) => s + x.perMin, 0);
      return `<tr>
        <td>${items}</td>
        <td class="muted">气巨星</td>
        <td><span class="machine-badge">${e.machineZh}</span></td>
        <td class="num"><b>${e.machines}</b></td>
        <td class="num">${fmt(total)}<span class="muted"> 合计</span></td>
        <td class="num muted">自供电</td>
      </tr>`;
    }
    const it = itemById(e.itemId);
    return `<tr>
      <td><span class="inline-item" data-id="${it.id}">${iconHtml(it)}<span>${it.zh || it.name}</span></span></td>
      <td class="muted">${sourceLabel(e.sourceKind)}</td>
      <td><span class="machine-badge">${e.machineZh}</span></td>
      <td class="num"><b>${e.machines}</b></td>
      <td class="num">${fmt(e.perMin)}/分 <span class="muted">(每台 ${fmt(e.perMachine)})</span></td>
      <td class="num">${e.powerMW > 0 ? fmt(e.powerMW, 4) + ' MW' : '—'}</td>
    </tr>`;
  }).join('');
  bindInlineItems($('t-extract'));
}
function sourceLabel(kind) {
  return { vein: '矿脉', ocean: '海洋/湖泊', gas: '气巨星', oil: '原油渗出点', photon: '射线接收站' }[kind] || kind;
}

function renderRaw(result) {
  const card = $('raw-card');
  const tbody = $('t-raw').querySelector('tbody');
  if (!result.rawMaterials.length) { card.style.display = 'none'; tbody.innerHTML = ''; return; }
  card.style.display = '';
  const targetRate = state.rate;
  tbody.innerHTML = result.rawMaterials.map((m) => {
    const it = itemById(m.itemId);
    return `<tr>
      <td><span class="inline-item" data-id="${it.id}">${iconHtml(it)}<span>${it.zh || it.name}</span></span></td>
      <td class="muted">${sourceLabel(m.sourceKind)}</td>
      <td class="num"><b>${fmt(m.perMin)}</b></td>
      <td class="num muted">${fmt(m.perMin / targetRate, 4)}</td>
    </tr>`;
  }).join('');
  bindInlineItems($('t-raw'));
}

function renderSurplus(result) {
  const card = $('surplus-card');
  const tbody = $('t-surplus').querySelector('tbody');
  if (!result.surplus.length) { card.style.display = 'none'; tbody.innerHTML = ''; return; }
  card.style.display = '';
  tbody.innerHTML = result.surplus.map((s) => {
    const it = itemById(s.itemId);
    return `<tr>
      <td><span class="inline-item" data-id="${it.id}">${iconHtml(it)}<span>${it.zh || it.name}</span></span></td>
      <td class="num pos">+${fmt(s.perMin)}/分</td>
      <td class="muted">${s.note || ''}</td>
    </tr>`;
  }).join('');
  bindInlineItems($('t-surplus'));
}

function renderExternal(result) {
  const card = $('external-card');
  const tbody = $('t-external').querySelector('tbody');
  if (!result.external.length) { card.style.display = 'none'; tbody.innerHTML = ''; return; }
  card.style.display = '';
  tbody.innerHTML = result.external.map((e) => {
    const it = itemById(e.itemId);
    const src = it.sources?.map((s) => s.kind).join('/') || '';
    return `<tr>
      <td><span class="inline-item" data-id="${it.id}">${iconHtml(it)}<span>${it.zh || it.name}</span></span></td>
      <td class="num"><b>${fmt(e.perMin)}/分</b></td>
      <td class="muted">${src === 'darkfog' ? '黑雾掉落' : '无生产配方'}</td>
    </tr>`;
  }).join('');
  bindInlineItems($('t-external'));
}

function renderFlow(result) {
  const card = $('flow-card');
  const tbody = $('t-flow').querySelector('tbody');
  if (!result.items.length) { card.style.display = 'none'; tbody.innerHTML = ''; return; }
  card.style.display = '';
  tbody.innerHTML = result.items.map((f) => {
    const it = itemById(f.itemId);
    const net = f.netPerMin;
    const cls = net > 1e-9 ? 'pos' : (net < -1e-9 ? 'neg' : '');
    return `<tr>
      <td><span class="inline-item" data-id="${it.id}">${iconHtml(it)}<span>${it.zh || it.name}</span></span></td>
      <td class="num">${fmt(f.producedPerMin)}</td>
      <td class="num">${fmt(f.consumedPerMin)}</td>
      <td class="num ${cls}">${net > 1e-9 ? '+' : ''}${fmt(net)}</td>
    </tr>`;
  }).join('');
  bindInlineItems($('t-flow'));
}

function renderOverrides(result) {
  const card = $('overrides-card');
  const chainIds = new Set();
  for (const row of result.recipes) {
    for (const x of [...row.in, ...row.out]) chainIds.add(x.itemId);
  }
  for (const m of result.rawMaterials) chainIds.add(m.itemId);
  for (const m of result.surplus) chainIds.add(m.itemId);
  for (const m of result.external) chainIds.add(m.itemId);
  chainIds.add(state.itemId);
  const multi = [...chainIds].map((id) => itemById(id))
    .filter((it) => it && engine.optionsForItem(it.id).length > 1);
  if (!multi.length) { card.style.display = 'none'; return; }
  card.style.display = '';
  $('overrides').innerHTML = multi.map((it) => {
    const opts = engine.optionsForItem(it.id);
    const current = state.recipeChoices[it.id] || defaultChoiceKey(it.id);
    return `<label>${it.zh || it.name}
      <select data-oid="${it.id}">
        <option value="">（默认）</option>
        ${opts.map((o) => {
          const key = optKey(o);
          const isDefault = key === defaultChoiceKey(it.id);
          return `<option value="${key}" ${key === current ? 'selected' : ''}>${escapeHtml(o.label)}${isDefault ? ' · 默认' : ''}</option>`;
        }).join('')}
      </select>
    </label>`;
  }).join('');
  $('overrides').querySelectorAll('select').forEach((sel) => sel.addEventListener('change', () => {
    if (sel.value === '') delete state.recipeChoices[Number(sel.dataset.oid)];
    else state.recipeChoices[Number(sel.dataset.oid)] = sel.value;
    compute();
  }));
}

function bindInlineItems(root) {
  root.querySelectorAll('.inline-item').forEach((el) => el.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const id = Number(el.dataset.id);
    if (!id) return;
    state.itemId = id;
    state.recipeChoices = {};
    renderSidebar();
    renderTarget();
    renderDetail();
    compute();
  }));
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------------- init ---------------- */
function init() {
  $('data-version').textContent = 'v' + DATA.gameVersion;
  $('footer-version').textContent = DATA.gameVersion + ' (' + DATA.dataSource.generated + ')';

  renderSidebar();
  populateSettings();

  // default target: universe matrix (宇宙矩阵) — the classic benchmark
  const def = DATA.items.find((i) => i.name === 'Universe Matrix') || DATA.items[0];
  state.itemId = def.id;
  state.rate = 30;
  $('rate').value = 30;
  renderTarget();
  renderDetail();
  compute();

  $('search').addEventListener('input', () => { state.search = $('search').value; renderSidebar(); });
  $('btn-clear-search').addEventListener('click', () => {
    state.search = '';
    $('search').value = '';
    renderSidebar();
  });
  $('rate').addEventListener('input', debounce(compute, 400));
  $('btn-compute').addEventListener('click', compute);
  $('btn-detail').addEventListener('click', () => {
    const card = $('detail-card');
    card.style.display = card.style.display === 'none' ? '' : 'none';
  });
  const presets = [1, 6, 15, 30, 60, 120, 180, 360, 720, 1800];
  $('presets').innerHTML = presets.map((p) => `<span class="preset" data-v="${p}">${p}</span>`).join('');
  $('presets').querySelectorAll('.preset').forEach((el) => el.addEventListener('click', () => {
    $('rate').value = el.dataset.v;
    compute();
  }));
  ['m-smelt', 'm-assemble', 'm-chemical', 'm-research', 'm-mining', 'm-prolif', 'm-prolif-mode',
    'm-selfspray', 'm-veins', 'm-oil', 'm-fbelt', 'm-fstack', 'm-lens'].forEach((id) => {
    $(id).addEventListener('change', compute);
  });
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

init();

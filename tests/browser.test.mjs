// Real browser-environment test using jsdom: serves web/ on an ephemeral port,
// loads web/index.html over HTTP, executes all scripts, and exercises the
// actual UI interactions (self-contained — no external server required).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { startServer } from '../research/serve.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const html = readFileSync(ROOT + 'web/index.html', 'utf8');

const server = await startServer(0, '127.0.0.1');
const dom = new JSDOM(html, {
  url: server.url,
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
});

const errors = [];
const { window } = dom;
window.addEventListener('error', (e) => errors.push(e.message));

await new Promise((resolve) => {
  window.addEventListener('load', () => setTimeout(resolve, 500));
});

const { document } = window;

function rows() {
  return [...document.querySelectorAll('#item-list .item-row')];
}
function fail(msg) {
  throw new Error(msg + (errors.length ? '\npage errors: ' + errors.join(' | ') : ''));
}
function typeSearch(value) {
  const search = document.getElementById('search');
  search.value = value;
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
}

console.log('== initial state: grouped catalog ==');
if (rows().length !== 174) fail(`expected 174 item rows, got ${rows().length}`);
const sections = [...document.querySelectorAll('#item-list details')];
const secNames = sections.map((s) => s.querySelector('summary').textContent.trim());
console.log('  sections:', secNames.join(' | '));
if (sections.length !== 6) fail(`expected 6 category sections, got ${sections.length}`);
const allOpen = sections.every((s) => s.open);
if (allOpen) fail('sections should be collapsed except the selected item section');

console.log('== browse & click without searching ==');
const ironRow = rows().find((x) => x.textContent.includes('铁块'));
if (!ironRow) fail('铁块 row not found in catalog');
ironRow.dispatchEvent(new window.Event('click', { bubbles: true }));
const target = document.getElementById('target-name').textContent;
if (!target.includes('铁块')) fail('clicking a row did not select the target');
const openSections = [...document.querySelectorAll('#item-list details')]
  .filter((s) => s.open).map((s) => s.dataset.group);
console.log(`  target=${target}; open sections: ${openSections.join(',')}`);
if (openSections.join(',') !== 'component') fail('selected item section should be open');
const tbody = document.querySelector('#t-factories tbody');
if (!tbody || !tbody.textContent.includes('Iron Ingot')) fail('factories table missing Iron Ingot after selection');
console.log('  ✓ compute ran, factories table populated');

console.log('== search: 铁 ==');
typeSearch('铁');
let r = rows();
console.log(`  filtered to ${r.length} rows:`, r.slice(0, 8).map((x) => x.textContent.trim().split('\n')[0]).join('、'));
if (r.length === 174) fail('search did not filter the list');
if (!r.every((x) => x.textContent.includes('铁'))) fail('search results contain non-matching rows');
if (document.querySelectorAll('#item-list details').length !== 0) fail('search mode should show flat list, not sections');

console.log('== search: iron ==');
typeSearch('iron');
r = rows();
console.log(`  filtered to ${r.length} rows`);
if (r.length === 0 || r.length === 174) fail('english search failed');
if (!r.every((x) => x.textContent.toLowerCase().includes('iron'))) fail('english search contains non-matching rows');

console.log('== search: no match ==');
typeSearch('不存在的物品xyz');
if (!document.querySelector('#item-list .empty')) fail('empty state missing for no-match search');

console.log('== select from search results clears filter ==');
typeSearch('磁铁');
const magnetRow = rows().find((x) => x.textContent.includes('磁铁'));
magnetRow.dispatchEvent(new window.Event('click', { bubbles: true }));
const target2 = document.getElementById('target-name').textContent;
if (!target2.includes('磁铁')) fail('selecting from search results failed');
if (document.getElementById('search').value !== '') fail('search box should be cleared after selection');
if (rows().length !== 174) fail('catalog should be fully restored after selection');
console.log(`  ✓ target=${target2}, search cleared, catalog restored`);

console.log('== recipe column shows Chinese names ==');
const firstCell = document.querySelector('#t-factories tbody tr td b');
if (!firstCell || firstCell.textContent !== '磁铁') {
  fail(`recipe name cell should show 磁铁, got: ${firstCell ? firstCell.textContent : '(none)'}`);
}
const subLine = document.querySelector('#t-factories tbody tr td .muted').textContent;
if (!subLine.includes('Magnet')) fail('english reference missing from recipe sub-line');
console.log('  ✓ 配方列中文: 磁铁 (英文 Magnet 保留在副行)');

console.log('== clear button ==');
typeSearch('铁块');
if (rows().length === 174) fail('search filter not applied');
document.getElementById('btn-clear-search').dispatchEvent(new window.Event('click', { bubbles: true }));
if (rows().length !== 174) fail('clear button did not restore catalog');

console.log('== column alignment: numeric headers match numeric data ==');
const numHeaders = document.querySelectorAll('.result-table th.num').length;
if (numHeaders !== 12) fail(`expected 12 numeric headers, got ${numHeaders}`);
for (const tableId of ['t-factories', 't-extract', 't-raw', 't-surplus', 't-external', 't-flow']) {
  const table = document.getElementById(tableId);
  if (!table) fail(`table ${tableId} missing`);
  const ths = [...table.querySelectorAll('thead th')];
  const trs = [...table.querySelectorAll('tbody tr')];
  ths.forEach((th, ci) => {
    const isNumHeader = th.classList.contains('num');
    for (const tr of trs) {
      const td = tr.children[ci];
      if (!td) continue;
      const isNumCell = td.classList.contains('num');
      if (isNumHeader !== isNumCell) {
        fail(`${tableId} 第${ci + 1}列: 表头${isNumHeader ? '数值' : '文本'} 与数据${isNumCell ? '数值' : '文本'}对齐不一致`);
      }
    }
  });
  console.log(`  ✓ ${tableId}: ${ths.length} 列全部表头/数据对齐一致 (${trs.length} 行)`);
}

console.log('== rate change recomputes ==');
const rate = document.getElementById('rate');
rate.value = '120';
rate.dispatchEvent(new window.Event('input', { bubbles: true }));
await new Promise((r2) => setTimeout(r2, 600)); // debounce
console.log('  ✓ rate input handled without page errors:', errors.length === 0 ? 'no errors' : errors.join('|'));

if (errors.length) fail('page errors: ' + errors.join(' | '));
await server.close();
console.log('\nALL BROWSER TESTS PASSED');

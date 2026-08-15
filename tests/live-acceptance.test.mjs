// 上线验收：对生产站点 https://gaodastar.github.io/dsp-calculator/ 做真实功能测试
import { JSDOM } from 'jsdom';

const LIVE = 'https://gaodastar.github.io/dsp-calculator/';
const errors = [];
const dom = await JSDOM.fromURL(LIVE, {
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
});
dom.window.addEventListener('error', (e) => errors.push(e.message));
await new Promise((r) => setTimeout(r, 4000)); // wait for scripts + icons

const { document } = dom.window;
function fail(msg) {
  throw new Error(msg + (errors.length ? '\npage errors: ' + errors.join(' | ') : ''));
}
const rows = () => [...document.querySelectorAll('#item-list .item-row')];

console.log('== live site acceptance ==');
console.log('URL:', LIVE);

if (rows().length !== 174) fail(`物品图鉴应有 174 行, 实际 ${rows().length}`);
console.log('  ✓ 物品图鉴 174 种物品');

const ver = document.getElementById('data-version').textContent;
console.log('  ✓ 数据版本:', ver);
if (!ver.includes('0.10.34')) fail('数据版本异常');

const search = document.getElementById('search');
search.value = '石墨烯';
search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
if (rows().length !== 1) fail(`搜索「石墨烯」应剩 1 行, 实际 ${rows().length}`);
console.log('  ✓ 搜索过滤正常');

const row = rows()[0];
row.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
const target = document.getElementById('target-name').textContent;
if (!target.includes('石墨烯')) fail('点击选择失败: ' + target);
console.log('  ✓ 点击选择:', target);

const rate = document.getElementById('rate');
rate.value = '60';
rate.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
await new Promise((r) => setTimeout(r, 800));

const tbody = document.querySelector('#t-factories tbody');
if (!tbody || !tbody.textContent.includes('Graphene')) fail('生产设施表未渲染');
const firstCell = tbody.querySelector('tr td b');
console.log('  ✓ 配方列中文:', firstCell.textContent, '| 行数:', tbody.children.length);

const summary = document.getElementById('summary');
if (!summary.textContent.includes('总电力')) fail('汇总缺失');
console.log('  ✓ 电力汇总渲染');

const icon = document.querySelector('#item-list img');
if (!icon || !icon.getAttribute('src')) fail('图标 img 缺失');
// jsdom 不解码图片 (naturalWidth 恒 0)，改走 HTTP 验证
const iconUrls = [...new Set([...document.querySelectorAll('#item-list img')].slice(0, 8).map((i) => i.getAttribute('src')))];
const { get } = await import('node:https');
const checkUrl = (u) => new Promise((res2, rej) => {
  get(new URL(u, LIVE), (r) => { r.resume(); r.on('end', () => res2(r.statusCode === 200)); }).on('error', rej);
});
for (const u of iconUrls) {
  if (!(await checkUrl(u))) fail('图标 404: ' + u);
}
console.log('  ✓ 图标加载正常 (抽查 ' + iconUrls.length + ' 个均 200)');

// 选中物品后详情卡应已自动打开（renderDetail 设置 display=''）
const detail = document.getElementById('detail-card');
if (detail.style.display === 'none' || !detail.textContent.includes('用途')) fail('详情卡未自动打开');
console.log('  ✓ 物品详情卡自动打开');
// 点击按钮应切换为关闭
const btnDetail = document.getElementById('btn-detail');
btnDetail.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
if (detail.style.display !== 'none') fail('详情卡切换按钮失效');
btnDetail.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
if (detail.style.display === 'none') fail('详情卡无法重新打开');
console.log('  ✓ 详情卡开/关切换正常');

if (errors.length) fail('页面存在 JS 错误');
console.log('  ✓ 无 JS 错误');

console.log('\n✅ 线上站点验收全部通过: ' + LIVE);

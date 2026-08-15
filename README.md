# 戴森球计划 · 产量量化计算器 (DSP Calculator)

基于 [dsp-wiki.com](https://dsp-wiki.com) 权威数据（`Module:GameData/protosets.json`，对应游戏版本 **0.10.34.28281**）开发的戴森球计划全物品产量量化工具。

给定目标物品和产量（个/分钟），自动求解完整生产链：

- **完整配方数据**：174 种物品、161 条配方（含黑雾时代全部新物品/建筑/弹药）
- **线性方程组求解**：正确处理循环产线（精炼油↔氢、裂解、重整精炼）、多产物配方（联产副产物自动抵扣）
- **副产物/盈余报告**：如等离子精炼副产氢、反物质产线的氢副产、气巨星采集器的共生气种
- **机器数量计算**：按所选机器等级向上取整（电弧/位面/负熵熔炉、制造台 Mk.I~III/重组式制造台、化工厂/量子化工厂、矩阵研究站/自演化研究站、采矿机/大型采矿机）
- **分馏塔建模**：按传送带速度×堆叠×1%转化率计算台数；氢净消耗按 1:1（环路循环再利用，符合 dsp-wiki Fractionator 页公式）
- **增殖剂支持**：Mk.I/II/III × 增产/加速模式，能量惩罚，自动计算增殖剂自身产线需求（含自喷涂不动点迭代）
- **采集设施**：矿脉（每台覆盖矿脉数可调）、海洋泵取、原油渗出点、气巨星（同台采集器同步采集全部气种）、射线接收站光子模式（可选引力透镜）
- **电力汇总**：总电力 + 空载 + 戴森球负载（光子接收）
- **中文界面**：物品/建筑中文名来自 wiki.biligame.com/dsp，英文名保留
- **离线可用**：174 个物品图标已下载至本地，`file://` 直接打开亦可运行

## 快速开始

### Web 界面（推荐）

```bash
npm run serve        # 启动本地服务器
# 打开 http://127.0.0.1:8080/
```

左侧为**物品图鉴**（按 资源/组件/建筑/矩阵/黑雾/其他 分组、可折叠），直接浏览并**点击物品**即可开始计算；顶部搜索框为可选过滤（支持中文/英文，选中物品后自动恢复图鉴）。或直接双击 `web/index.html`（file:// 模式同样可用，无需服务器）。

### 命令行

```bash
node cli/calc.mjs 宇宙矩阵 60                       # 60个宇宙矩阵/分钟
node cli/calc.mjs 重氢 60 --choice 重氢=分馏         # 重氢走分馏塔路线
node cli/calc.mjs 铁块 60 --machine Smelt=位面熔炉    # 指定熔炉
node cli/calc.mjs 宇宙矩阵 30 --proliferator 3        # Mk.III增殖剂(增产模式)
node cli/calc.mjs 石墨烯 60 --choice 石墨烯=Graphene\ (advanced) --choice 可燃冰=gas
node cli/calc.mjs --list 矩阵                        # 物品搜索
node cli/calc.mjs --info 宇宙矩阵                    # 物品详情
node cli/calc.mjs 宇宙矩阵 60 --json                  # JSON 输出
```

## 开发

```bash
npm run build-data    # 从 dsp-wiki.com 抓取并生成 data/dsp-data.json
npm run build-web     # 生成 web/data.js 与 web/engine.js
npm run fetch-icons   # 从 wiki 下载物品图标
npm test              # 26 项引擎测试 + Web 冒烟测试 + jsdom 真实浏览器交互测试
```

### 自动发布

- 推送 main 即触发 GitHub Actions：`npm ci → 构建 → 全量测试 → 发布 GitHub Pages`
- 沙箱/本机自动推送通道：`research\push.cmd`（走 Windows 原生 OpenSSH，凭据在 `.ssh/`、`.ssh-home/`，均已 gitignore）
- 手动数据刷新：Actions 页面 → "refresh game data" → Run workflow（重新抓取 dsp-wiki 数据 → 测试 → 生成 PR）

## 项目结构

```
data/dsp-data.json     完整数据集（物品/配方/科技/矿脉/气巨星/机器参数/增殖剂）
src/engine.mjs         计算引擎（线性求解、循环处理、增殖剂不动点、采集规划）
cli/calc.mjs           命令行工具
web/                   单页 Web 应用（零依赖、离线可用）
  index.html / app.js / style.css / data.js / engine.js / icons/
research/              数据抓取与构建脚本（wiki 原始数据快照见 research/raw/）
tests/                 引擎测试、Web 冒烟测试与 jsdom 浏览器交互测试
```

## 数据来源与验证

- 物品/配方/科技/矿脉/星球主题：[dsp-wiki.com Module:GameData/protosets.json](https://dsp-wiki.com/Module:GameData/protosets.json)（游戏 0.10.34.28281 官方数据）
- 机器速度/电力/采矿速率：dsp-wiki.com 各建筑 `/ItemInfo` 页面
- 增殖剂参数：dsp-wiki.com [Spray Coater](https://dsp-wiki.com/Spray_Coater) 页面
- 分馏塔数学：dsp-wiki.com [Fractionator](https://dsp-wiki.com/Fractionator) 页面
- 中文名：wiki.biligame.com/dsp 物品/建筑索引页

**端到端验证**：dsp-wiki "Arc Smelter" 页面的官方产能图（60 电弧熔炉/分钟 = 600 铁矿 + 180 铜矿 + 120 石矿、16 台熔炉、6 台 Mk.II 制造台）与本工具输出完全一致，见 `tests/engine.test.mjs`。

## 已知简化假设

- 每个物品的联产物"恰好被消耗"，盈余部分单独列出（可回收/燃烧）
- 采集器/采矿机数量向上取整；传送带/分拣器瓶颈不做检查
- 气巨星采集率按 wiki 基础值 8/分钟 × 气种权重（可视为默认假设）
- 原油渗出点产量默认 120/分钟（约 2/s），可在设置中调整

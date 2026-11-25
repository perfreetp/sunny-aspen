# 筒仓通风道管网生成与方案比选工具

面向设计院方案比选阶段的 Svelte 5 + PixiJS 单页工具。填入筒仓内径、檐高、锥底角度和装粮线后，页面同步生成平面圆与剖面轮廓；选择粮种、风道形式、主风道走向、支风道路数和风口行列数后，可生成带稳定编号的管网与风口阵列。

## 启动

```bash
npm install
npm run dev
```

浏览器打开 Vite 输出的地址（默认 http://127.0.0.1:5173）。

生产构建：

```bash
npm run build
npm run preview
```

## 核心操作

1. 在「参数设计」页填写筒仓参数，平面和剖面轮廓立即联动。
2. 选择粮种、风道形式、主风道走向、支风道数、风口排数/列数和种子号。
3. 点击「生成 / 按当前参数重排管网」。
4. 在 PixiJS 平面图中：
   - 拖动某条支路：梳形支路记录绝对横向位置 `xM`，放射/环形支路记录绝对方向角 `angleDeg`。
   - 点击风口后按 `Delete`、`Backspace` 或风口旁的红色 `×` 删除。
   - 也可在左侧「手改保留栏」精确输入支路位置、恢复单路或恢复全部风口。
5. 改内径时，未手改支路按新内径重算长度和位置；已手改支路的覆盖记录不会被清空，只按新内径重算长度并做边界钳制。
6. 改装粮线时，风口间距的粮层深度系数变化，其余风口重排；已删除的稳定编号（如 `v-2-3`）不会回来。
7. 相同参数和种子生成相同的原始管网指纹；换种子会得到不同的支路摆动/放射角/错列方案。
8. 在「方案比选」页并排查看 A/B 两套参数、PixiJS 管网、指标和差异表，选定一套后进入「选型交接」。
9. 交接页可复制选型摘要、导出含支路坐标和风口坐标的 JSON、打印/另存 PDF。

## 稳定性设计

- 所有几何生成均为纯函数，位于 `src/lib/domain/geometry.js`。
- 随机数使用种子哈希 + Mulberry32，不使用 `Math.random()` 或 `Date.now()` 参与布局。
- 支路稳定 ID 为 `b0...bN`，风口稳定 ID 为 `v-<row>-<col>`。
- 手改和删除单独存放在 `branchOverrides` 与 `removedVentIds`，不回写自动布局源数据。
- A/B 方案状态和手改记录保存在浏览器 `localStorage`。

## 验证

领域不变量测试：

```bash
npm run verify:domain
```

它会验证：

- 同参数同种子结果一致；
- 不同种子结果不同；
- 风口间距和支管长度随内径增大；
- 手改支路覆盖在内径变化后保留；
- 删除的风口在装粮线变化后不恢复，其余风口会移动。

浏览器交互检查（需要先启动 `npm run preview -- --port 4173`）：

```bash
node scripts/browser-check.mjs
```

该脚本使用 `puppeteer-core` 调用本机 Chrome/Edge，实际验证 Pixi 画布拖动、风口删除、参数联动、种子复现、比选页和交接确认。

## 目录说明

```text
src/
  App.svelte                         顶部导航、页面切换、Toast、本地持久化
  lib/state.svelte.js                Svelte 5 响应式方案状态与操作
  lib/domain/catalog.js              粮种、风道形式、主风道、参数范围
  lib/domain/rng.js                  确定性哈希、PRNG、数值工具
  lib/domain/geometry.js             筒仓剖面、管网、风口、工程量纯函数
  lib/pixi/drawPlan.js               PixiJS 平面绘制与指针拖拽
  lib/components/PlanCanvas.svelte   Pixi Application 生命周期
  lib/components/SectionProfile.svelte  SVG 筒仓剖面
  lib/components/ParameterPanel.svelte  参数表单
  lib/components/ManualPanel.svelte  手改支路/已删风口保留栏
  lib/components/CompareView.svelte  A/B 并排比选
  lib/components/HandoffView.svelte  设备厂选型交接与 JSON 导出
```

工程风量、压力和粮量指标用于方案比选阶段的辅助估算，不替代施工图阶段的风网阻力计算和现行规范复核。

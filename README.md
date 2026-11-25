# 粮堆剖面温度云图工具

一个零前端框架的实验性工具：使用 **Konva + 原生 TypeScript + Web Components** 实现逐日电缆测温表落格、粮层温度笔刷云图、分层热力图、可塑形高温区、层间温度梯度线、图层开关、按笔划撤销和研判底图 PNG 导出。

## 启动

```bash
npm install
npm run dev
```

浏览器打开 Vite 输出的地址（默认 <http://localhost:5173>）。

生产构建：

```bash
npm run build
npm run preview
```

类型检查：

```bash
npm run typecheck
```

## 测温 CSV 格式

使用 UTF-8 CSV，一行一个电缆测点读数，必需列：

| 列名 | 可识别别名 | 说明 |
| --- | --- | --- |
| 日期 | 观测日期、测量日期、date、time | 可含多天；导入后在左上角切换日期 |
| 电缆编号 | 电缆号、电缆、cableId、cable | 决定剖面横向格点 |
| 层号 | 层、layer、layerNo | 整数，1 为最上层，向下递增 |
| 温度 | 测温值、temp、temperature | 数字，单位 ℃ |

示例：

```csv
日期,电缆编号,层号,温度
2026-11-26,C01,1,18.2
2026-11-26,C01,2,19.1
2026-11-26,C06,5,33.8
2026-11-26,C08,8,21.4
```

应用首次打开会载入一份 `8 电缆 × 8 层 × 5 天` 的内置示例。侧边栏也可以下载 CSV 模板，或导入 [`public/sample-temperature.csv`](public/sample-temperature.csv) 做最小流程验证。

## 功能与操作

1. **导入落格**：选择 CSV 后按 `电缆编号 + 层号` 建立索引，测点圆点、温度文字和热力格自动落到剖面对应位置；多日期可切换。
2. **剖面笔刷云图**：选择温度档和小 / 中 / 大三档笔刷，在某个粮层内沿粮层拖动。每个粮层持有独立的低分辨率温度场，笔刷边缘有柔化。
3. **分层热力图**：切换到“分层热力图”并选择层号，只显示当前层的大格热力图和该层独立云图；切层不会读写其他层的温度场。
4. **高温区圈选与塑形**：选择“圈高温”，沿区域拖一圈后松手。自动切到塑形工具；拖动白色控制点改变边界，也可以拖动区域内部整体移动。红色温度蒙版由温度场阈值生成并被当前多边形实时裁剪，因此会随边界重新贴合。
5. **梯度线**：选择“梯度线”，沿粮层高度拉一条线。系统逐层采样平均温度，比较相邻层温差，在线上标出温差最大的突变层、方向和幅度；端点可继续拖动重算。
6. **独立图层**：温度云图、热力图格点、高温区 / 蒙版、梯度标注分别位于独立 Konva Layer / Group，复选框只切换对应图层。
7. **按笔划撤销**：一次 `pointerdown → pointerup` 的连续笔划只压入一条快照；点击“撤销上一笔”或按 `Ctrl/⌘ + Z` 整笔回退。
8. **研判底图导出**：点击“保存当前剖面研判底图 PNG”，导出 2 倍图，包含坐标剖面、温度云图、高温区边界 / 蒙版、数据日期、高温统计和导出时间。

## 代码结构

```text
src/
├─ main.ts                         # 入口，引入样式和 Web Component
├─ types.ts                        # 共享类型与 UI 快照
├─ data/sample.ts                  # 内置逐日示例数据
├─ lib/
│  ├─ csv.ts                       # 无依赖 CSV 解析和表头别名识别
│  ├─ geometry.ts                  # 剖面、粮层、分层图坐标
│  ├─ polygon.ts                   # 点在多边形、路径简化、层带裁剪
│  └─ temperature.ts               # 温度分档与颜色
├─ core/
│  ├─ TemperatureField.ts          # 单层独立温度场、笔刷、蒙版栅格
│  └─ Workbench.ts                 # Konva Stage、图层、交互、撤销、导出
└─ components/grain-workbench.ts   # <grain-workbench> Web Component 和侧边栏 UI
```

## 浏览器冒烟测试

仓库包含一个基于 Puppeteer Core 的有头浏览器脚本（不会自动下载 Chromium，使用本机 Chrome）：

```bash
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
node scripts/smoke-browser.mjs
```

脚本会实际验证：笔刷撤销、高温区生成与控制点拖动、梯度突变层、分层温度场不串层、图层开关隔离、CSV 导入和 PNG 导出路径，并输出若干 `smoke-*.png` 截图。

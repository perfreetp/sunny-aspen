# 火山剖面岩层标注排版系统

面向论文与报告研究人员的火山地质剖面标注工具：沿剖面线切出岩层剖面，自动排版岩性标注与引线，
产出可直接放进评审材料的矢量图。技术栈 **React + Paper.js + opentype.js + Vite**。

## 核心能力

### 1. 剖面线选择（两种来源）
- **地质图实测位置**：平面地质图上预置 12 条实测剖面线，点击选择，可拖拽端点微调位置。
- **三维模型斜拉**：在伪三维立体地形上依次点击取点，斜着拉出一条折线剖面，自动生成斜切剖面。

### 2. 剖面切割
沿剖面折线重采样 160 个站，从合成火山模型（地形 + 10 个岩层界面）切出：
- 各岩性界面折线、岩层多边形、每层垂直厚度与统计值（中点/均值/极值）。
- 12 号剖面穿过火山口，顶部两层在火山口附近急剧减薄，是标注拥挤的典型场景。

### 3. 标注自动排版（`src/layout/engine.js`）
- 每个标注写**岩性名称 + 年代 + 厚度**，支持层内、层外两种放置。
- **薄层自动外挪**：层内垂直空间放不下文字框时，自动移到剖面外侧并加短引线。
- **肘形引线自动绕行**（`src/layout/elbowRouter.js`）：锚点竖直出露到地表上方通道 →
  通道水平汇聚 → 竖直对齐 → 短接入文字框。引线不压层界线；已布引线实时作为障碍，
  几条引线挤在一起时逐级让位、互相错开。
- **合并薄层标注**：把相邻的若干薄层合并成一条标注，系统重排该段引线与文字，并生成指向各成员层的支线；可随时拆分恢复。
- **改一处约束、整版重排**：修改年代/名称/厚度/字号/比例/垂直夸大，全部标注位置与引线重新计算；排版是纯函数，结果确定可复现。
- 手动拖动标注框即固定其位置（pinned），重排时保留；可一键解除固定。

### 4. 矢量文字（opentype.js）
- 载入 Noto Sans / Noto Sans SC 的 **woff** 字体（opentype.js 1.x 不支持 woff2）。
- 每个字形转成独立矢量 Path 绘制，**缩放不糊**，导出的 SVG/PNG 可直接进 Illustrator、评审材料。
- 字号按剖面比例（hScale、vExag）确定。

### 5. 三栏界面
- 左：剖面线列表（实测 / 斜切分组，显示合并、隐藏、斜切标记）。
- 中：Paper.js 剖面画布（滚轮缩放、空白拖拽平移、标注框拖动）。
- 右：标注属性编辑（名称/年代/厚度/侧别/隐藏）、剖面样式参数、标注清单。

### 6. 持久化与评审交付
- 自动保存到 `localStorage`；可导出/导入**可再编辑项目稿 JSON**，专家意见回来后结构不丢、接着改。
- 导出当前剖面为矢量 **SVG**。
- 「整理评审材料」打包 **ZIP**：每条剖面一份 SVG + 可编辑项目稿 + README 清单。
- 撤销 / 重做（最多 40 步）。

## 目录结构

```
src/
  model/
    volcanoModel.js   合成火山模型：地形、10 层厚度函数、实测剖面线、网格采样
    section.js        剖面切割 buildSection、坐标变换 makeSectionTransform
  layout/
    geometry.js       纯几何工具（相交、距离、矩形、多边形）
    textUtil.js       折行等纯文字工具
    labelContent.js   标注记录 -> 文本行
    elbowRouter.js    正交肘形引线规划（绕界面、引线互让）
    engine.js         排版主引擎：层内/外决策、薄层外挪、合并、整版重排
  fonts/
    fontManager.js    opentype 载入 woff、测量、逐字形 path
    *.woff            Noto Sans / Noto Sans SC（400/700）
  render/
    viewBuilder.js    模型+排版 -> 与 paper 无关的视图数据（渲染与 SVG 导出共用）
  components/
    SectionCanvas.jsx Paper.js 剖面画布（缩放/平移/拖拽/岩性花纹/矢量文字）
    PlanPicker.jsx    平面地质图选线
    ReliefPicker.jsx  伪三维斜拉选线
    LinePickerModal.jsx
    SectionList.jsx   左栏
    PropertiesPanel.jsx 右栏
  state/
    projectStore.js   项目数据、合并/拆分、localStorage、JSON 往返
    reducer.js        状态机 + 撤销/重做
  export/
    svgExport.js      矢量 SVG 生成（逐字形文字、岩性花纹 pattern）
    bundle.js         评审 ZIP 打包
tests/                Node 原生测试（13 个，含真实 woff 字体）
```

## 运行

```bash
npm install
npm run dev      # 开发服务器（固定端口 5217）
npm run build    # 生产构建
npm test         # Node 测试（排版/切割/导出，13 个用例）
```

## 设计要点与取舍

- **引线用确定性肘形路由而非网格 A\***：层界线在剖面上是连续曲线，栅格缓冲后容易形成封闭墙把寻路困死；
  肘形走法把「竖直出露（必然穿越上覆界面）」与「通道水平段（严格净空）」分开处理，
  在 12 条剖面 ×10 标注的 120 条引线中仅最深基底的 12 条短引线触发直线兜底（界面有明确提示）。
- **排版引擎与渲染解耦**：`computeLayout` 是不依赖 paper/DOM 的纯函数，同一份视图数据驱动 Paper.js 画布与 SVG 导出，便于在 Node 中测试。
- **逐字形 Path**：多个 opentype 子路径合并进单个 paper Path 会触发填充异常（文字变黑块），因此每个字形独立成 Path。

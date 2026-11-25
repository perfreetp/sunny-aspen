# 火山锥区熔岩流单元总览与协同会商工具

一个使用 **Svelte 5 + PixiJS 8 + pixi-viewport 7** 构建的 GIS 原型，面向火山灾害评估组与地质编图人员的同工程协同、熔岩流单元总览、期次追踪、避险范围对比和会商周交接。

内置程序化示范工程：**21,600 个熔岩流单元 + 24,000 个火山碎屑/砾石点 + 锥界、碎屑席、沟谷、村子和避险范围，共 45,632 个要素**。首屏数据在本地确定性生成，无需后端或外部地图 Token。

## 启动

```bash
npm install
npm run dev
```

打开终端输出的 <http://127.0.0.1:5173/>。

生产构建与本地预览：

```bash
npm run build
npm run preview
```

无头 Chrome 运行时巡检（需要本机安装 Chrome；脚本中的 Chrome 路径可按系统调整）：

```bash
npm run verify
```

## 已实现的工作流

### 编图人员

1. 用顶部或左侧的 **“导入航测地形”** 载入 PNG/JPG 正射影像或 DEM 山影图；也可以直接把图片拖入窗口。
2. 用 **“导入范围 GeoJSON”** 载入地质图圈定的火山锥边界、各期熔岩流范围和避险范围；也支持拖拽 `.geojson/.json`。
3. 熔岩流范围会被铺成按期次分色的单元层，单元界线位于独立 Pixi Graphics 层。
4. 选择单元后，在地图工具栏切换到 `✎`，拖动白色顶点即可修边；松开鼠标后写入 IndexedDB、递增工程版本，并通知同浏览器其他标签页刷新。
5. 可导出完整工程 JSON 备份或移交。

GeoJSON 属性识别：

- 期次字段：`periodId`、`period`、`phase`、`期次`、`地质期次`、`code`、`代号`。
- 单元编号：`code`、`unitCode`、`单元编号`、`编号`。
- 图层类型：`layer`、`kind`、`type`、`图层`、`类型`，包含 `cone/火山锥/锥边界` 识别为锥界，包含 `refuge/避险/安置` 或 `village/村` 识别为避险范围，其余面要素识别为熔岩流单元。
- 外部坐标会自动计算范围、保持纵横比并归一化到演示工程坐标。

### 评估人员

1. 默认双端视图中，右侧为评估视图，已开启“晚全新世晚期”单期追踪；左侧编图视图保留全部期次。
2. 在左侧图层面板单击任意期次，即可让当前控制视图“只留这一期”，沿沟谷观察下游路径。
3. 可叠加预编的村子避险范围，或用地图工具栏 `▱` 在图上逐点单击、双击闭合，圈画自定义避险范围。
4. 与当前可见期次/图层相交的单元会以琥珀色描边，右侧面板显示相交数量。
5. 顶部“转到沟口细看…”可飞到六个沟口；点击右下角 **“列当前视野单元与前缘”**，右侧生成虚拟滚动清单。
6. 清单列出单元编号、期次、沟谷、前缘 X/Y、距锥心距离，可定位图斑、飞到前缘或导出 CSV。

### 协同与选中

- 默认打开 **双端视图**：左为编图岗，右为评估岗；两个 Pixi viewport 可独立缩放平移。
- 任一端点选、Shift/Ctrl 多选或从清单选中单元后，另一端地图会绘制同一组协同轮廓：编图为青色，评估为粉色。
- 右侧“选中与会商”面板分别显示两端选中 ID，可点击 ID 飞到对应视图中的图斑。
- 同浏览器另开标签页时，可分别承担两个岗位；选择状态和工程修订通过 `BroadcastChannel('volcano-lava-review-v1')` 同步。
- 工程保存在浏览器 **IndexedDB**。编图修边或导入后，评估标签页会收到工程版本通知并重载；手动刷新浏览器或点击“↻ 刷新工程”也会从 IndexedDB 读取新界线，无需重新导入。

> 这是一个纯前端协同原型。跨标签页/双视图使用本地协同总线；若两名人员使用不同电脑，需要把 `src/lib/state.svelte.js` 中的 BroadcastChannel/IndexedDB 替换为 WebSocket 协同服务和服务端工程存储，数据结构与选中消息可直接沿用。

## 渲染与可用性细节

- **空间索引**：单元按 170 m 网格建索引，悬停拾取、视野清单、避险相交和标注碰撞只查询候选单元。
- **界线 LOD**：
  - 低缩放隐藏海量单元细线，只画各期/熔岩流主干外轮廓，避免缩成黑块；
  - 放大到阈值后按视野候选绘制单元界线；
  - 线宽使用 `screenPixels / viewport.scale`，缩放后按动画帧重绘，保持约 1 屏像素，不会随地图放大变粗或模糊。
- **标注避让**：低于 175% 缩放只显示锥界、沟谷、村子等主标注；超过阈值逐个计算单元编号和期次标签，使用 AABB 占位与邻近界线相交检测，碰撞或压线则不显示。
- **长列表**：当前视野可能有上万个单元，清单使用固定行高虚拟滚动。
- **会商周**：顶部“📌 会商周”抓取当前一个或两个 Pixi 视图，用 Canvas 2D 拼成带标题、期次图例、两端选中、避险范围和交接说明的 PNG；同时可下载交接 GeoJSON。
- **交接 GeoJSON**：包含两端选中的熔岩流单元 Polygon、单元前缘 Point、避险范围 Polygon，以及 metadata 中的分层配色、工程版本、视图状态和 selection 状态，可供后续避险范围划定环节读取。

## 目录结构

```text
src/
  App.svelte                         # 总体布局、导入、工程/会商周编排
  main.js
  app.css
  lib/
    MapController.js                 # Pixi Application、viewport、图层、拾取、LOD、标注
    geo.js                           # 几何、空间索引、相交、下载工具
    sampleProject.js                 # 4.5 万示范要素生成器与期次配色
    terrain.js                       # 程序化 DEM/山影 Canvas 纹理
    state.svelte.js                  # Svelte 5 状态、IndexedDB、BroadcastChannel
    db.js                            # IndexedDB 简单 KV
    projectIO.js                     # GeoJSON 导入、CSV/工程/交接数据
    briefing.js                      # 会商 PNG 排版与下载
    components/
      MapStage.svelte
      LayerPanel.svelte
      RightPanel.svelte
      UnitVirtualList.svelte
      BriefingModal.svelte
scripts/
  verify-runtime.mjs                 # puppeteer-core 运行时巡检
```

## 后续接真实业务数据时建议

1. 用 DEM/正射影像的真实地理范围替换 `WORLD` 局部坐标，并接入 Proj4/EPSG 转换。
2. 将 GeoJSON 导入替换为 WFS/GeoPackage/PostGIS 接口；海量数据可进一步改为矢量瓦片或 WebGPU 实例化渲染。
3. 把 IndexedDB 工程文档替换为带版本号和冲突合并的服务端 CRDT/OT。
4. 把 BroadcastChannel 消息桥接到 WebSocket，即可让不同机器上的编图组和评估组实时互见选中与修边。
5. 会商周 PNG 出图前补入正式图幅、比例尺、图例、编制单位、审核签名和 CGCS2000/UTM 坐标格网。

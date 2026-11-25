# 机关触发特效合成台

一个用**原生 TypeScript + Web Components + Konva** 实现的剧场机关触发瞬间特效合成工具。设计师可以把现场/侧面照片铺成底图，叠加灯光闪烁、烟雾扩散和多层火星，用时间轴安排触发时间，逐层调透明度，用蒙版笔刷局部压暗，并导出给现场调试员的参数表。

## 启动

```bash
npm install
npm run dev
```

打开 Vite 输出的本地地址（默认 <http://127.0.0.1:5173>）。

生产构建：

```bash
npm run build
npm run preview
```

## 已实现的交付要点

- **底图铺设与导演视角替换**
  - 可导入真实现场照片、相机触发瞬间图片。
  - 内置正面 / 侧面示例底图，可一键模拟导演要求换成玩家侧面视角。
  - 替换底图只改背景，效果层的顺序、时间点、透明度、蒙版和变换全部保留。
- **固定层级模板**
  - 灯光闪烁：最上层，混合模式默认 `screen`。
  - 烟雾：中间层，默认普通透明混合。
  - 火星：最底层，默认 `lighter` 叠加。
  - 图层面板按“灯光 → 烟雾 → 导入素材 → 火星 → 底图”展示。
- **剧情节奏时间轴**
  - 内置触发、白闪、火星、烟雾、高频闪烁等 Cue。
  - 片段可横向拖动改触发时间，可拖右缘改持续时间。
  - 标尺点击定位播放头，支持播放、循环和“按时间点显隐”。
- **逐层透明度与效果参数**
  - 每层行内和检查器都有透明度滑杆。
  - 灯光频率/强度、烟雾扩散/密度/漂移、火星密度/速度均可调。
  - 程序化 Canvas/Konva 动画呈现频闪、烟雾扩散和火星粒子。
- **蒙版笔刷**
  - 可在选中层上用“压暗/遮去”笔刷绘制层蒙版，也可用“恢复”笔刷擦回。
  - 每个笔划是一条独立历史，`Ctrl/Cmd + Z` 按笔划撤销，`Ctrl/Cmd + Shift + Z` 或 `Ctrl + Y` 重做。
  - 笔刷移动时直接绘制该层离屏蒙版并局部合成，不重建组件树，避免多层面板导致卡顿。
- **框选、移动、变换与蒙版联动**
  - 空白处拖出选框，可加选多层。
  - 选中后拖动会按当前缩放逆换算到 1920×1080 工程坐标，多选层一起移动。
  - Konva Transformer 可缩放/旋转；蒙版、效果画面是同一个 Group 内的离屏 `Konva.Image`，所以移动、缩放、旋转都严格一起对齐。
- **参数表导出**
  - 右上角“参数表 / 定稿导出”。
  - 页面内预览顶层到底层的顺序、触发时间、持续/结束、透明度、混合、坐标、缩放、旋转、蒙版笔划数和效果参数。
  - 支持复制 TSV、下载带 BOM 的 Excel 友好 CSV、下载 JSON、打印/另存 PDF。

## 快捷键

| 按键 | 功能 |
| --- | --- |
| `V` | 选择 / 框选 / 变换 |
| `B` | 蒙版笔刷 |
| `Space` | 播放 / 暂停 |
| `Ctrl/Cmd + Z` | 撤销（笔刷按笔划） |
| `Ctrl/Cmd + Shift + Z` / `Ctrl + Y` | 重做 |
| `Delete` / `Backspace` | 删除选中层 |

在输入框、文本域或下拉框中输入时，快捷键不会拦截编辑操作。

## 代码结构

```text
src/
  main.ts                         入口
  styles.css                      整体深色工作台样式
  types.ts                        领域模型与层级排序
  actions/studioActions.ts        添加层、导入图片、替换底图
  canvas/
    StageController.ts            Konva 舞台、框选、拖动、Transformer、笔刷蒙版
    textures.ts                   示例照片、灯光、烟雾、火星程序化绘制
  components/
    effect-studio.ts              <effect-studio> 总装组件
    studio-toolbar.ts             <studio-toolbar>
    studio-layer-panel.ts         <studio-layer-panel>
    studio-inspector-panel.ts     <studio-inspector-panel>
    studio-timeline-panel.ts      <studio-timeline-panel>
    studio-export-dialog.ts       <studio-export-dialog>
  state/
    store.ts                      状态、选择、播放、快照历史
    assets.ts                     导入图片的离屏资源注册表
    defaultProject.ts             默认定稿示例工程
  lib/
    parameterSheet.ts             参数表 CSV/JSON/打印
    importMedia.ts                图片读取与 Cover/Contain 栅格化
scripts/
  smoke.mjs                       基础无头 Chrome 冒烟测试
  interaction-smoke.mjs           框选/拖动/播放交互测试
```

## 浏览器冒烟测试

需要本机安装 Chrome 或 Edge，并先运行 `npm run build` 与 `npm run preview -- --port 4173`：

```bash
node scripts/smoke.mjs
node scripts/interaction-smoke.mjs
```

测试使用 `puppeteer-core` 连接系统浏览器，不会额外下载 Chromium。

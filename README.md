# 棚影 ShadeMotion · 遮阳帘开合动画编排工具

给农业装备售前方案工程师使用的 React + TypeScript + Three.js 单页工具。棚体骨架、拱架和轨道按方案数据生成，可在三维视图中调整轨道端点、编排电机行程/启停节奏、编辑每条轨道的速度曲线、建立可嵌套编组与时间条，并导出可直接发给甲方的离线验收演示 HTML（含农户开帘建议）。

## 启动

```bash
npm install
npm run dev
```

终端会输出实际端口（默认 `http://localhost:5173`，若被占用会自动顺延）。

生产构建：

```bash
npm run build
npm run preview
```

## 已实现的编排能力

- **方案带入**：内置西青番茄示范棚样例；左侧可导入方案交换 JSON 或验收工程 JSON，也可读取 `public/sample-plan.json` 示例。
- **三维棚体**：抛物拱棚骨架、纵梁、立柱、半透明棚顶、6 条拱架轨道、端点球和帘布 Ribbon。
- **双端点独立调整**：右侧滑杆或直接在三维视图拖动绿色收拢端 A / 橙色展开端 B；端点弧长会回写为实际行程。
- **设备参数联动**：行程、额定线速度、缓启/缓停从设备参数区读取；修改行程会同步端点位置、帘布长度和机械展开时长，并触发所在组的关键帧等比重排。
- **独立速度曲线**：每条轨道一条“展开进度 → 速度倍率”曲线；拖动控制点即时改变当前时间采样到的展开位置，可双击空白加点、双击点删除。
- **中途停顿**：可添加多个“展开到 X% 后停 Y 秒”的停顿；时间条上以琥珀色斜纹段和起止关键帧显示。
- **可嵌套编组**：勾选轨道后编组；组检查器可继续把勾选项编成子组、加入已有节点或取消编组。
- **整组预览**：拖动组时间条会把主播放头定位到对应全局时间，组内所有轨道使用同一个纯函数采样；也可双击或点击“预览整组”循环播放组区间。
- **比例重排**：修改组内任意轨道的展开时长，会以组起点为锚点等比缩放组内所有轨道的起点、运动/保持/收拢时长、停顿时长和派生关键帧。回放、拖动时间条、曲线标记和三维帘布都读取同一个 `sampleTrack()` 结果。
- **防穿棚顶**：轨道曲线固定在抛物屋面下方，帘布沿该曲线生成；检查器和视口实时显示最小净距，内置净距采样校验。
- **验收导出**：一键导出自包含 HTML，内含 Canvas 动画、播放/拖动、验收清单和农户开帘时间表；也可导出/再导入编排 JSON。

## 关键代码

```text
src/types.ts                    工程、轨道、编组、设备参数类型
src/data/seed.ts                内置棚体/轨道/嵌套组样例
src/store.ts                    Zustand 状态、编组、行程联动、比例重排
src/lib/timing.ts               速度曲线积分、停顿调度、关键帧、统一时间采样
src/lib/tree.ts                 编组树遍历、组区间、等比缩放
src/lib/trackGeometry.ts        拱棚屋面/轨道曲线、净距校验
src/three/GreenhouseStage.ts    Three.js 棚体、帘布、端点球、射线拖拽
src/components/Viewport.tsx     React 三维挂载层
src/components/CurveEditor.tsx 速度曲线拖点编辑器
src/components/Timeline.tsx     层级时间条、关键帧、停顿段、整组拖动预览
src/components/Inspector.tsx    轨道/设备/电机/停顿/编组检查器
src/lib/exportDemo.ts           离线甲方验收 + 农户讲解 HTML 生成器
```

## 方案交换 JSON 示例

```json
{
  "projectName": "某叶菜遮阳棚",
  "planCode": "PLAN-001",
  "greenhouseModel": "GH-80",
  "tracks": [
    { "name": "西侧轨道", "code": "T01", "z": -3, "strokeMm": 5000, "speedMps": 0.28 }
  ]
}
```

完整示例见 `public/sample-plan.json`。应用导出的编排 JSON 也可以通过同一入口再次载入。

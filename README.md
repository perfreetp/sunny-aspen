# Flight FX Studio · 起飞/接地特效调校台

Vue 3 + Vite + three.js 的飞行科目特效方案原型。场景中包含跑道、地景楼、简化飞机、发动机尾流、接地尘环和滑跑扬尘；所有效果都挂在飞行参数上，并支持确定性种子、参数分组、联动保护、建筑防穿模碰撞和科目配置包导出。

## 启动

```bash
npm install
npm run dev
```

浏览器打开终端给出的地址（开发服务器首选 http://localhost:5183，端口被占用时 Vite 会自动后移）。

生产构建：

```bash
npm run build
npm run preview
```

预览服务固定在 http://localhost:43173。

生成交给科目配置人员的静态 JSON 包：

```bash
npm run package:handoff
```

产物在 `handoff/`：

- `flight-takeoff-landing-fx.package.json`：当前默认完整特效包
- `flight-takeoff-landing-<surface>.package.json`：五种道面材质版本
- `material-variants.json`：共享同一 seed 的材质版本合集
- `subject-config.example.json`：科目配置挂载示例

也可以在界面右下角 **“5. 种子 / 碰撞 / 打包”** 中导出当前调校结果或批量材质版本。

## 已实现的需求对照

### 尾流挂飞行参数

- 两个喷口锚点：`engine_L_exhaust`、`engine_R_exhaust`。
- 油门升高时：
  - 动力系数升高；
  - 发射率升高；
  - 不透明度/浓度增强；
  - 实时尾流长度向 `wake.length` 基准值增长。
- 收油门后停止新增浓颗粒，已有颗粒继续扩散、上升并在寿命结束时慢慢散掉，不会瞬间消失。
- 序列动作包含起飞滑跑、抬轮、离地和初始爬升；也可切到“手动挂参调试”直接拖油门/空速/高度/轮载。

实时长度公式：

```text
power01 = 0.18 + 0.82 * throttle
actualWakeLength = wake.length * (0.22 + 0.78 * power01)
```

### 手调长度和颗粒数不被推力冲掉

`wake.length` 和 `wake.particleCount` 是联动字段：

1. 未手动修改时，它们随“发动机额定推力”给出的建议值变化。
2. 一旦教员拖动其中任意一项，该字段立即标记为 `locked/manual`。
3. 之后再改额定推力，锁定的手调基准值原样保留。
4. 点击字段旁的 **“🔒 手调保留”** 或底部 **“全部恢复推力联动”** 才会解除保护并重新跟随建议值。
5. 锁定状态会写入导出包的 `linkage.manualLocks`。

注意：锁定的是“满推力基准长度/颗粒上限”。实时尾流仍会随油门动态缩短/变淡，这是运行时缩放，不会覆盖教员调好的基准值。

### 接地扬尘和离地停止

- 飞行状态从 `weightOnWheels=false` 变为 `true` 时触发 `touchdown`。
- 接地瞬间从主轮锚点生成一圈径向尘土颗粒，并播放扩散尘环。
- `gearDown && weightOnWheels && airspeed > 0.6` 时持续产生向后/侧向扬尘。
- 轮子离地后 `weightOnWheels=false`，连续扬尘发射立即停止；已有尘土继续扩散消散。
- 面板里的“手动触发接地扬尘”可在任意时刻预览尘环。

### 参数分组和即时反馈

右侧面板按以下组排列：

1. 起飞/接地动作；
2. 发动机与联动保护；
3. 发动机尾流；
4. 地面材质与扬尘；
5. 种子/碰撞/打包。

尾流和扬尘分别提供：

- 浓度；
- 扩散强度；
- 上升速度；
- 颗粒粗细；
- 颗粒数上限；
- 不透明度、湍流、寿命等高级参数。

所有滑杆直接修改 Vue reactive 参数，Three.js 下一个固定仿真步即读取新值；暂停时也会刷新颗粒大小/透明度外观。

### 确定性种子

- 随机数使用 `mulberry32`，按 `seed:wake`、`seed:ground-dust` 分流。
- 仿真使用固定步长 `simulation.fixedStep = 1/60` 和累加器。
- 不使用 `Math.random()` 生成仿真颗粒，不使用 `Date.now()` 推进仿真。
- 点“重播同一套动作”或“应用并回放”会清空颗粒、重建种子随机流并重置飞行动作器。
- 相同 seed + actionProfile + parameters 会得到相同颗粒校验和；换 seed 才改变随机形态。

界面“换种子”按钮本身可用系统随机数生成新的种子整数，但生成后的颗粒流仍然完全由该整数决定。

### 机场材质版本

内置：

- 水泥混凝土；
- 沥青；
- 砂石/碎石；
- 土质/草地；
- 压实积雪。

切换材质会改变跑道颜色和扬尘颜色、浓度、扩散、上升、粗细、颗粒数、尘环半径等预设。批量导出的材质版本共享同一个 seed 和动作，方便教员横向比较。

### 跑道、地景楼和防穿模

- 场景包含 310m 跑道、标线、边灯和六栋 AABB 地景楼/塔台/机库。
- 每个建筑都有 `min/max` 碰撞盒。
- 颗粒靠近建筑时产生转向/抬升绕流力；进入扩展 AABB 后按最小穿透面推出，并衰减法向速度。
- 可打开“显示碰撞盒”检查边界。
- 可关闭碰撞做性能/效果对比，但默认开启。

## 导出包如何挂到科目

导出的 `.flightfx.json` 不只是参数快照，还包含：

- `format: flight-fx-package` 和版本号；
- seed、固定步长和 RNG 说明；
- 动作 profile；
- 道面材质；
- 完整 `parameters`；
- 推力联动公式和手动锁定；
- 飞行参数绑定路径；
- `touchdown` / `liftoff` 事件；
- 喷口、机轮接触锚点；
- 碰撞策略和特效列表；
- 可选运行时遥测快照。

科目配置人员可参考 `handoff/subject-config.example.json`，把包挂到 `effects.takeoffLanding`，并将真实飞行数据映射到：

```text
flight.throttle
flight.ratedThrustKn
flight.airspeed
flight.altitude
flight.gearDown
flight.weightOnWheels
flight.touchdown
flight.liftoff
```

如果真实项目不是 three.js，配置包中的参数、触发条件和曲线公式仍可作为特效美术/蓝图/粒子系统的移植规格。

## 代码结构

```text
src/
  App.vue                         # 布局、导入导出、全局状态
  main.js
  styles.css
  components/
    ControlPanel.vue              # 分组参数面板
    ParamSlider.vue               # 滑杆 + 联动锁定徽标
    SceneViewport.vue             # Three 场景 Vue 容器
  fx/
    schema.js                     # 默认参数、材质、联动、打包/校验
    rng.js                        # mulberry32 + 种子哈希
    FlightDirector.js            # 固定步长起飞/接地/连续起落动作器
  three/
    FlightFxScene.js              # 场景、飞机、机场、发射、碰撞、相机
    SmokeParticleSystem.js        # 确定性 CPU 粒子 + 自定义 shader
scripts/
  build-handoff-package.mjs       # 生成 handoff JSON
handoff/                          # 可直接交付的配置包和示例
```

## 后续接入真实项目的建议

1. 用真实飞行总线替换 `FlightDirector`，只保留 `FlightFxScene` 的参数读取和事件入口。
2. 将飞机模型替换为机型模型，但保留同名锚点：`engine_L_exhaust`、`engine_R_exhaust`、三个机轮接触点。
3. 如果场景建筑变化，从场景碰撞体生成 `colliders: {min,max}[]` 传给粒子更新。
4. 美术验收后可把高成本 CPU 粒子迁移到 GPU 粒子；种子、参数范围和事件契约不需要变。

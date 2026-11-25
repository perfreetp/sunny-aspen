# 起飞/接地特效交付包

配置同学可直接使用：

- `flight-takeoff-landing-fx.package.json`：当前完整特效参数、种子、绑定和触发事件。
- `flight-takeoff-landing-<surface>.package.json`：按道面材质生成的版本。
- `material-variants.json`：共享同一 seed 的五种材质版本合集。
- `subject-config.example.json`：挂到起飞接地科目配置的示例。

关键字段：

```text
format = flight-fx-package
deterministic.seed
parameters.wake
parameters.dust
parameters.locks
bindings
effects[].emitWhen / stopWhen
```

挂载要点：

1. 将真实飞行参数映射到 `bindings` 中的 throttle、airspeed、gearDown、weightOnWheels。
2. `touchdown` 事件触发地面尘环。
3. `weightOnWheels=false` 后停止连续扬尘发射，已有粒子自然消散。
4. 手调锁定的 `wake.length` 和 `wake.particleCount` 不得被发动机推力联动覆盖。
5. 相同 seed、动作和参数应得到同一条确定性粒子流。

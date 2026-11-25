/* ── presets.js · 野外产状图鉴 / 喷发类型模板 / 碎屑层预设 ──────────────────
 * 与 geom.js 一样保持“无依赖、可直接拼接进导出播放器”的约束。
 * ──────────────────────────────────────────────────────────────────────── */

/* 锥体形态：按野外产状的典型剖面参数
 * shape：pL/pR 左右坡幂指数（>1 凹坡＝层状锥，<1 凸坡＝穹丘）
 *        cr 火口半径比，depth 火口深/高比，lean 风偏，notch 右侧缺口，seed/detail 轮廓噪声
 */
export const CONE_PRESETS = [
  {
    id: 'rampart',
    name: '溅落锥·低平',
    en: 'spatter rampart',
    cat: '溅落锥',
    blurb: '火口初开，溅落渣在火口周缘堆成低矮环垣，坡角约 10–18°。',
    mode: '火口阶段',
    shape: { pL: 2.1, pR: 2.0, cr: 0.34, depth: 0.12, lean: 0.02, seed: 1.3, detail: 0.018 },
    size: { hw: 235, h: 76 },
    tone: 0.28,
    intensity: 0.25
  },
  {
    id: 'scoria',
    name: '浮岩锥·雏形',
    en: 'scoria cone',
    cat: '溅落锥',
    blurb: '斯通博利式喷发堆积的对称浮岩锥，火口呈漏斗状，坡角约 30°。',
    mode: '持续喷发',
    shape: { pL: 1.55, pR: 1.45, cr: 0.2, depth: 0.3, lean: 0.015, seed: 2.7, detail: 0.013 },
    size: { hw: 245, h: 186 },
    tone: 0.45,
    intensity: 0.5
  },
  {
    id: 'strato-steep',
    name: '层状锥·陡',
    en: 'steep stratocone',
    cat: '层状锥',
    blurb: '熔岩与碎屑互层叠覆，上陡下缓的凹形坡，火口窄而深。',
    mode: '普林尼式',
    shape: { pL: 1.9, pR: 1.78, cr: 0.075, depth: 0.3, lean: 0.015, seed: 4.1, detail: 0.01 },
    size: { hw: 300, h: 322 },
    tone: 0.58,
    intensity: 0.85
  },
  {
    id: 'strato-broad',
    name: '层状锥·宽缓',
    en: 'broad stratocone',
    cat: '层状锥',
    blurb: '多期喷发叠覆的宽缓层状锥，锥体宽高比大，常见于长期活动的复合火山。',
    mode: '多期叠加',
    shape: { pL: 1.75, pR: 1.62, cr: 0.11, depth: 0.24, lean: 0.02, seed: 6.2, detail: 0.011 },
    size: { hw: 408, h: 252 },
    tone: 0.5,
    intensity: 0.6
  },
  {
    id: 'shield',
    name: '盾状体',
    en: 'shield volcano',
    cat: '盾状',
    blurb: '低黏度玄武质熔岩反复溢流形成，坡角仅数度，顶部为塌陷火口。',
    mode: '熔岩溢流',
    shape: { pL: 1.7, pR: 1.55, cr: 0.07, depth: 0.22, lean: 0.01, seed: 8.4, detail: 0.007 },
    size: { hw: 520, h: 118 },
    tone: 0.4,
    intensity: 0.3
  },
  {
    id: 'dome',
    name: '熔岩穹丘',
    en: 'lava dome',
    cat: '穹丘',
    blurb: '高黏度熔岩挤出堆积，侧坡陡立、顶部浑圆，常见崩落成因的碎屑锥裙。',
    mode: '挤出阶段',
    shape: { pL: 0.72, pR: 0.66, cr: 0.04, depth: 0.05, lean: 0.025, seed: 3.3, detail: 0.014 },
    size: { hw: 168, h: 218 },
    tone: 0.62,
    intensity: 0.45
  },
  {
    id: 'collapse',
    name: '破火口·塌陷',
    en: 'collapsed crater',
    cat: '塌陷',
    blurb: '喷发后火口壁失稳塌陷，火口显著加宽加深，右侧常保留溢流缺口。',
    mode: '塌陷阶段',
    shape: { pL: 1.85, pR: 1.62, cr: 0.16, depth: 0.46, lean: 0.01, notch: 0.7, seed: 5.5, detail: 0.014 },
    size: { hw: 352, h: 268 },
    tone: 0.36,
    intensity: 0.3
  },
  {
    id: 'parasitic',
    name: '寄生锥',
    en: 'parasitic cone',
    cat: '溅落锥',
    blurb: '主锥侧翼裂隙上堆积的小型溅落锥，指示侧向岩浆运移通道。',
    mode: '侧翼活动',
    shape: { pL: 1.65, pR: 1.55, cr: 0.26, depth: 0.28, lean: 0.02, seed: 9.1, detail: 0.017 },
    size: { hw: 118, h: 96 },
    tone: 0.48,
    intensity: 0.32
  }
];

export const CONE_BY_ID = Object.fromEntries(CONE_PRESETS.map((p) => [p.id, p]));

/* 火山碎屑层：覆盖在锥体与地面上的一层可累积物质 */
export const TEPHRA_PRESETS = [
  {
    id: 'ash-thin',
    name: '薄层火山灰',
    en: 'ash fall',
    blurb: '细粒空降灰，披覆在锥坡与地表，层厚薄而均一。',
    thickness: 16,
    cover: 0.5,
    grain: 1.0,
    tone: 0.5,
    fall: 0.35
  },
  {
    id: 'pumice-fall',
    name: '空降浮岩层',
    en: 'pumice fall',
    blurb: '喷发柱空降形成的浮岩与渣状颗粒层，近火口迅速增厚。',
    thickness: 38,
    cover: 0.78,
    grain: 1.5,
    tone: 0.66,
    fall: 0.7
  },
  {
    id: 'ignimbrite',
    name: '火山碎屑流堆积',
    en: 'ignimbrite',
    blurb: '密度流贴地运移后堆积，层厚大、分布广，常带熔结与炭化纹理。',
    thickness: 66,
    cover: 1.0,
    grain: 2.0,
    tone: 0.4,
    fall: 0.45
  }
];

export const TEPHRA_BY_ID = Object.fromEntries(TEPHRA_PRESETS.map((p) => [p.id, p]));

/* 喷发类型模板：新建动画时一键铺好阶段序列，再按野外产状替换锥体 */
export const ERUPTION_TEMPLATES = [
  {
    id: 'strombolian',
    name: '斯通博利式',
    en: 'Strombolian',
    blurb: '间歇性气泡爆破，渣锥生长，末端熔岩溢流。',
    phases: [
      { name: '前奏·火口开启', kind: '前奏', durF: 60, cone: 'rampart', lava: 0.0, tephra: 'ash-thin', thick: 0.25, plume: 0.22, note: '火口张开，少量溅落堆积，地震与气体排放增强。' },
      { name: '间歇爆破', kind: '持续喷发', durF: 96, cone: 'scoria', lava: 0.06, tephra: 'pumice-fall', thick: 0.5, plume: 0.58, note: '气泡在火口破裂，抛射渣块，锥体快速加积。' },
      { name: '熔岩溢流', kind: '熔岩溢流', durF: 126, cone: 'scoria', lava: 0.82, tephra: 'ash-thin', thick: 0.4, plume: 0.4, note: '火口溢流，熔岩沿锥坡下泄，前缘越过锥缘进入平地。' },
      { name: '减弱·结壳', kind: '间歇', durF: 84, cone: 'scoria', lava: 0.94, tephra: 'ash-thin', thick: 0.3, plume: 0.18, note: '喷发间歇，熔岩表面结壳，前缘推进停滞。' }
    ]
  },
  {
    id: 'plinian',
    name: '普林尼式',
    en: 'Plinian',
    blurb: '高喷发柱、空降浮岩，柱体失稳后碎屑流与破火口塌陷。',
    phases: [
      { name: '前奏·压力累积', kind: '前奏', durF: 84, cone: 'strato-broad', lava: 0.0, tephra: 'ash-thin', thick: 0.2, plume: 0.25, note: '岩浆房增压，火口周围出现微小形变与低频震颤。' },
      { name: '喷发柱建立', kind: '普林尼式', durF: 108, cone: 'strato-steep', lava: 0.05, tephra: 'pumice-fall', thick: 0.6, plume: 0.95, umbrella: true, note: '连续喷发柱冲上对流层，伞状云顶开始向四周扩展。' },
      { name: '空降浮岩', kind: '持续喷发', durF: 120, cone: 'strato-steep', lava: 0.08, tephra: 'pumice-fall', thick: 1.0, plume: 1.0, umbrella: true, note: '浮岩层顺风加厚，下风向数十公里出现空降堆积。' },
      { name: '柱体失稳·碎屑流', kind: '持续喷发', durF: 96, cone: 'strato-steep', lava: 0.12, tephra: 'ignimbrite', thick: 0.9, plume: 0.6, umbrella: false, note: '喷发柱部分坍塌，密度流贴地扩散，碎屑层覆盖锥脚。' },
      { name: '破火口塌陷', kind: '塌陷阶段', durF: 90, cone: 'collapse', lava: 0.2, tephra: 'ignimbrite', thick: 0.7, plume: 0.35, note: '火口壁失稳塌陷，火口显著加宽加深。' },
      { name: '残余活动', kind: '间歇', durF: 72, cone: 'collapse', lava: 0.26, tephra: 'ash-thin', thick: 0.35, plume: 0.16, note: '喷发转入间歇，残余蒸汽与少量灰排放。' }
    ]
  },
  {
    id: 'hawaiian',
    name: '夏威夷式',
    en: 'Hawaiian',
    blurb: '裂隙熔岩喷泉与大规模溢流，盾状体持续加积。',
    phases: [
      { name: '裂隙开启', kind: '前奏', durF: 66, cone: 'shield', lava: 0.0, tephra: 'ash-thin', thick: 0.15, plume: 0.15, note: '沿裂隙出现熔岩线状喷泉，火口初步贯通。' },
      { name: '熔岩喷泉', kind: '持续喷发', durF: 96, cone: 'shield', lava: 0.42, tephra: 'ash-thin', thick: 0.25, plume: 0.5, note: '持续喷泉抛射，渣与熔岩滴就近堆积。' },
      { name: '大规模溢流', kind: '熔岩溢流', durF: 156, cone: 'shield', lava: 0.96, tephra: 'ash-thin', thick: 0.2, plume: 0.3, note: '低黏度熔岩快速下泄，前缘沿地面呈舌状扩展。' },
      { name: '通道化·停滞', kind: '间歇', durF: 90, cone: 'shield', lava: 1.0, tephra: 'ash-thin', thick: 0.18, plume: 0.12, note: '熔岩在管流中运移，前缘结壳停滞。' }
    ]
  },
  {
    id: 'vulcanian',
    name: '武尔卡诺式',
    en: 'Vulcanian',
    blurb: '短促猛烈爆发，抛出碎屑与底浪，火口反复清空。',
    phases: [
      { name: '前奏·堵塞', kind: '前奏', durF: 72, cone: 'strato-steep', lava: 0.0, tephra: 'ash-thin', thick: 0.2, plume: 0.2, note: '火口被致密熔岩塞封堵，气体压力持续累积。' },
      { name: '短促爆发', kind: '持续喷发', durF: 54, cone: 'strato-steep', lava: 0.04, tephra: 'pumice-fall', thick: 0.7, plume: 0.85, note: '塞体被炸开，数分钟内抛出大量碎屑。' },
      { name: '碎屑流扩散', kind: '持续喷发', durF: 84, cone: 'strato-steep', lava: 0.08, tephra: 'ignimbrite', thick: 0.95, plume: 0.55, note: '崩落碎屑形成小规模密度流沿沟谷下泄。' },
      { name: '灰云·间歇', kind: '间歇', durF: 96, cone: 'collapse', lava: 0.12, tephra: 'ash-thin', thick: 0.5, plume: 0.3, note: '火口浅化，灰云缓慢抬升，活动转入间歇。' }
    ]
  },
  {
    id: 'domegrowth',
    name: '熔岩穹丘',
    en: 'Dome growth',
    blurb: '高黏度岩浆挤出、穹丘生长与崩落碎屑流。',
    phases: [
      { name: '前奏·挤出开始', kind: '前奏', durF: 78, cone: 'dome', lava: 0.0, tephra: 'ash-thin', thick: 0.2, plume: 0.18, note: '高黏度岩浆到达火口，开始缓慢挤出。' },
      { name: '穹丘生长', kind: '挤出阶段', durF: 132, cone: 'dome', lava: 0.18, tephra: 'ash-thin', thick: 0.3, plume: 0.3, note: '穹丘横向扩展、纵向加高，表层冷却开裂。' },
      { name: '崩落·碎屑流', kind: '持续喷发', durF: 84, cone: 'dome', lava: 0.3, tephra: 'ignimbrite', thick: 0.8, plume: 0.42, note: '穹丘前缘失稳崩落，碎屑流沿翼部堆积。' },
      { name: '余热·休眠', kind: '休眠', durF: 72, cone: 'dome', lava: 0.34, tephra: 'ash-thin', thick: 0.4, plume: 0.1, note: '挤出停止，穹丘进入冷却与喷气阶段。' }
    ]
  }
];

export const TEMPLATE_BY_ID = Object.fromEntries(ERUPTION_TEMPLATES.map((t) => [t.id, t]));

export const PHASE_KINDS = [
  '前奏', '火口阶段', '持续喷发', '熔岩溢流', '挤出阶段', '塌陷阶段',
  '普林尼式', '多期叠加', '侧翼活动', '间歇', '休眠'
];

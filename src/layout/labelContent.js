// 标注文字内容构建（纯函数，无浏览器依赖）
import { wrapText } from './textUtil.js';

// 标注记录 -> 文本行（岩性名称 / 年代·厚度 / 合并层附加行）
export function buildLabelLines(record, stats, opts) {
  const maxChars = opts.maxCharsPerLine ?? 9;
  if (record.type === 'merged') {
    const members = record.members
      .map((idx) => stats[idx])
      .filter(Boolean)
      .sort((a, b) => a.idx - b.idx);
    const lines = [];
    const name = members.map((m) => m.name).join('＋');
    lines.push(...wrapText(name, maxChars));
    const ages = members.map((m) => m.age).join('-');
    const total = members.reduce((sum, m) => sum + m.thicknessMid, 0);
    lines.push(`${ages}  ${total.toFixed(0)}m`);
    return lines;
  }
  const st = stats[record.layerIdx];
  const name = record.nameOverride ?? st.name;
  const age = record.ageOverride ?? st.age;
  const thickness = record.thicknessOverride ?? st.thicknessMid;
  const lines = wrapText(name, maxChars);
  lines.push(`${age}  ${thickness.toFixed(1)}m`);
  return lines;
}

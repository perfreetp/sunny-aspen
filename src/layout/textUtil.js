// 纯文字工具（Node 与浏览器共用，不加载字体文件）

// 按最大字符数折行（中文按字、含显式换行）
export function wrapText(text, maxChars) {
  const out = [];
  for (const rawLine of String(text).split('\n')) {
    let line = '';
    for (const ch of rawLine) {
      line += ch;
      if ([...line].length >= maxChars) {
        out.push(line);
        line = '';
      }
    }
    if (line) out.push(line);
  }
  return out.length ? out : [''];
}

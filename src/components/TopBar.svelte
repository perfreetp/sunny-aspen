<script>
  /* TopBar —— 工程 / 新建 / 导入导出 / 撤销重做 */
  import { studio } from '../lib/store.svelte.js';
  import { ERUPTION_TEMPLATES } from '../lib/presets.js';

  let { onExport } = $props();
  let fileInput = $state(null);
  let newOpen = $state(false);
  let newName = $state('');

  function pickTemplate(t) {
    studio.newFromTemplate(t.id, newName.trim() || `${t.name}喷发`);
    newOpen = false;
  }

  async function importFile(e) {
    const f = e.currentTarget.files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      studio.loadDoc(JSON.parse(text));
    } catch (err) {
      studio.say(`导入失败：${err.message}`);
    } finally {
      e.currentTarget.value = '';
    }
  }

  function exportJSON() {
    const data = JSON.stringify($state.snapshot(studio.doc), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(studio.doc.name || 'eruption').replace(/[\\/:*?"<>|]/g, '_')}.eruption.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    studio.say('工程 JSON 已导出');
  }
</script>

<header class="top">
  <div class="brand">
    <span class="logo" aria-hidden="true"></span>
    <div>
      <h1>火山喷发阶段编排台</h1>
      <p>按阶段推进 · 锥体 / 熔岩流 / 碎屑层三轨</p>
    </div>
  </div>

  <input
    class="title-input"
    type="text"
    value={studio.doc.name}
    onchange={(e) => studio.rename(e.currentTarget.value)}
    aria-label="工程名称" />

  <div class="sep"></div>

  <div class="group">
    <button class="btn" onclick={() => studio.undo()} disabled={!studio.canUndo} title="撤销 (Ctrl+Z)">↶ 撤销</button>
    <button class="btn" onclick={() => studio.redo()} disabled={!studio.canRedo} title="重做 (Ctrl+Shift+Z)">↷ 重做</button>
  </div>

  <div class="group">
    <button class="btn primary" onclick={() => (newOpen = !newOpen)} aria-expanded={newOpen}>＋ 新建动画</button>
    {#if newOpen}
      <div class="pop" role="dialog" aria-label="新建动画">
        <p class="pop-h">按喷发类型铺好阶段序列，再按野外产状替换锥体</p>
        <input type="text" placeholder="工程名称（可留空）" bind:value={newName} />
        <div class="tpls">
          {#each ERUPTION_TEMPLATES as t}
            <button class="tpl" onclick={() => pickTemplate(t)}>
              <b>{t.name}</b>
              <small>{t.en} · {t.phases.length} 阶段</small>
              <span>{t.blurb}</span>
            </button>
          {/each}
        </div>
        <button class="btn ghost sm" onclick={() => { studio.newBlank(); newOpen = false; }}>空白工程</button>
      </div>
    {/if}
  </div>

  <div class="group">
    <button class="btn" onclick={() => fileInput?.click()}>导入</button>
    <input bind:this={fileInput} type="file" accept=".json,application/json" onchange={importFile} hidden />
    <button class="btn" onclick={exportJSON}>导出 JSON</button>
    <button class="btn" onclick={onExport}>导出动画</button>
  </div>

  <div class="right">
    <label class="tg">
      <input type="checkbox" bind:checked={studio.showGhost} />
      上一阶段叠影
    </label>
    <label class="tg">
      <input type="checkbox" bind:checked={studio.ghostLava} />
      叠影含熔岩
    </label>
    <label class="tg">
      <input type="checkbox" bind:checked={studio.ghostTephra} />
      叠影含碎屑
    </label>
    <label class="tg">
      <input type="checkbox" bind:checked={studio.showLabels} />
      标注
    </label>
  </div>
</header>

<div class="scrim" class:hide={!newOpen} onclick={() => (newOpen = false)} onkeydown={(e) => e.key === 'Escape' && (newOpen = false)} role="presentation"></div>

<style>
  .top {
    display: flex; align-items: center; gap: 12px; padding: 0 14px; height: 52px;
    border-bottom: 1px solid var(--line); background: var(--bg1); position: relative; z-index: 20;
  }
  .brand { display: flex; align-items: center; gap: 9px; flex: none; }
  .logo {
    width: 22px; height: 22px; border-radius: 6px;
    background: linear-gradient(160deg, #ffb066, #b8441a);
    clip-path: polygon(50% 0, 100% 100%, 0 100%);
  }
  .brand h1 { margin: 0; font-size: 13px; font-weight: 700; letter-spacing: .01em; }
  .brand p { margin: 1px 0 0; font-size: 10px; color: var(--fg3); }

  .title-input {
    width: 190px; height: 26px; font-size: 12px;
  }
  .sep { width: 1px; height: 22px; background: var(--line2); }
  .group { display: flex; gap: 4px; align-items: center; position: relative; }
  .right { margin-left: auto; display: flex; gap: 12px; align-items: center; }
  .tg { display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--fg2); cursor: pointer; white-space: nowrap; }

  .pop {
    position: absolute; top: calc(100% + 8px); left: 0; z-index: 40; width: 520px;
    background: var(--bg2); border: 1px solid var(--line2); border-radius: 10px;
    padding: 12px; display: flex; flex-direction: column; gap: 8px;
    box-shadow: 0 18px 50px rgba(0,0,0,.5);
  }
  .pop-h { margin: 0; font-size: 11px; color: var(--fg3); }
  .pop input[type="text"] { width: 100%; }
  .tpls { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .tpl {
    display: flex; flex-direction: column; gap: 2px; text-align: left;
    padding: 8px 10px; border-radius: 7px; border: 1px solid var(--line2);
    background: var(--bg3); cursor: pointer;
  }
  .tpl:hover { border-color: var(--accent); background: #262031; }
  .tpl b { font-size: 12px; }
  .tpl small { font-size: 10px; color: var(--fg3); }
  .tpl span { font-size: 10.5px; color: var(--fg2); line-height: 1.45; }

  .scrim { position: fixed; inset: 0; z-index: 10; }
  .scrim.hide { display: none; }
</style>

<script>
  import { config } from '../lib/stores.js';
  import { CATEGORIES } from '../lib/data/categories.js';
  import { exportConfigJson } from '../lib/data/generator.js';

  let fileInput;

  function updateCat(catId, patch) {
    config.update((cfg) => ({
      ...cfg,
      categories: cfg.categories.map((c) => (c.id === catId ? { ...c, ...patch } : c))
    }));
  }

  function updateThreshold(catId, key, val) {
    config.update((cfg) => ({
      ...cfg,
      categories: cfg.categories.map((c) =>
        c.id === catId ? { ...c, thresholds: { ...c.thresholds, [key]: val } } : c
      )
    }));
  }

  function resetDefaults() {
    config.update((cfg) => ({
      ...cfg,
      simplificationBias: 1,
      categories: CATEGORIES.map((c) => ({
        id: c.id,
        name: c.name,
        visible: c.visible,
        minLevel: c.minLevel,
        thresholds: { ...c.defaultThresholds }
      }))
    }));
  }

  function exportConfig() {
    const cfg = $config;
    const blob = new Blob([exportConfigJson(cfg)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `landscape-feature-config-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importConfig(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const incoming = JSON.parse(reader.result);
        if (!incoming.categories) throw new Error('配置文件缺少 categories');
        config.set(incoming);
      } catch (err) {
        alert('配置导入失败：' + err.message);
      }
    };
    reader.readAsText(file);
  }
</script>

<div class="config-panel">
  <div class="cp-head">
    <span>地景要素配置</span>
    <div class="cp-actions">
      <button onclick={exportConfig} title="导出 JSON 配置">导出</button>
      <button onclick={() => fileInput.click()} title="从 JSON 导入配置">导入</button>
      <button onclick={resetDefaults} title="恢复默认阈值">复位</button>
      <input
        bind:this={fileInput}
        type="file"
        accept=".json,application/json"
        hidden
        onchange={(e) => e.target.files[0] && importConfig(e.target.files[0])}
      />
    </div>
  </div>

  <div class="cp-bias">
    <label>全局简化强度</label>
    <div class="bias-row">
      <input
        type="range"
        min="0.4"
        max="2.5"
        step="0.05"
        value={$config.simplificationBias}
        oninput={(e) => config.update((c) => ({ ...c, simplificationBias: +e.target.value }))}
      />
      <b>{$config.simplificationBias.toFixed(2)}×</b>
    </div>
    <small>阈值整体缩放：越大越晚简化（近处才聚合），越小越早简化</small>
  </div>

  <div class="cp-list">
    {#each $config.categories as cat (cat.id)}
      {@const meta = CATEGORIES.find((c) => c.id === cat.id)}
      <div class="cp-cat" class:off={!cat.visible}>
        <div class="cp-cat-head">
          <i class="fl-dot" style:background={meta.cssColor}></i>
          <b>{cat.name}</b>
          <label class="cp-switch">
            <input
              type="checkbox"
              checked={cat.visible}
              onchange={(e) => updateCat(cat.id, { visible: e.target.checked })}
            />
            <span>图层</span>
          </label>
        </div>
        <div class="cp-thr">
          <label>
            抽稀阈值
            <input
              type="number"
              step="0.05"
              min="0.05"
              max="10"
              value={cat.thresholds.lod1}
              onchange={(e) => updateThreshold(cat.id, 'lod1', +e.target.value)}
            />
            <em>m/px</em>
          </label>
          <label>
            聚合阈值
            <input
              type="number"
              step="0.05"
              min="0.1"
              max="12"
              value={cat.thresholds.lod2}
              onchange={(e) => updateThreshold(cat.id, 'lod2', +e.target.value)}
            />
            <em>m/px</em>
          </label>
          <label class="cp-level">
            最低级别
            <select
              value={cat.minLevel}
              onchange={(e) => updateCat(cat.id, { minLevel: +e.target.value })}
            >
              <option value={0}>可聚合</option>
              <option value={1}>保留至抽稀</option>
            </select>
          </label>
        </div>
      </div>
    {/each}
  </div>
</div>

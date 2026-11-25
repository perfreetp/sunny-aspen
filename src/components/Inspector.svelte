<script>
  /* Inspector —— 阶段属性 / 三轨道 / 关键帧 / 编组 / 一致性检查 */
  import { studio } from '../lib/store.svelte.js';
  import { TRACK_LEG, inspectFrame } from '../lib/scene.js';
  import { CONE_PRESETS, TEPHRA_PRESETS, PHASE_KINDS } from '../lib/presets.js';
  import { phaseStart } from '../lib/doc.js';

  const ph = $derived(studio.phase);
  const idx = $derived(studio.selectedPhase);
  const start = $derived(phaseStart(studio.doc, idx));
  const cur = $derived(studio.current);

  const coneDef = $derived(CONE_PRESETS.find((p) => p.id === ph.tracks.cone.presetId) || CONE_PRESETS[1]);
  const group = $derived(studio.groupOfTrack('cone'));

  /* 该阶段每帧的越界情况，用于“逐帧检查” */
  const scan = $derived.by(() => {
    const out = [];
    const total = ph.durF;
    const step = Math.max(1, Math.floor(total / 24));
    for (let f = 0; f < total; f += step) {
      const g = start + f;
      const r = inspectFrame(studio.doc, g, { ghost: false });
      if (r.issues.length) out.push({ frame: g, local: f, ...r });
    }
    return out;
  });

  const curInspect = $derived(inspectFrame(studio.doc, studio.frame, { ghost: false }));

  const keyRows = $derived.by(() => {
    return TRACK_LEG.map((t) => ({
      ...t,
      keys: (ph.tracks[t.key].keys || []).map((k) => ({
        ...k,
        gf: Math.round(start + k.u * ph.durF)
      }))
    }));
  });

  function gotoKey(k) {
    studio.setFrame(Math.round(start + k.u * ph.durF));
  }
</script>

<aside class="insp" aria-label="属性检查器">
  <!-- 阶段 -->
  <section class="blk">
    <header>
      <span class="tag">阶段 {idx + 1}</span>
      <div class="acts">
        <button class="btn sm ghost" onclick={() => studio.movePhase(idx, -1)} disabled={idx === 0} title="前移">↑</button>
        <button class="btn sm ghost" onclick={() => studio.movePhase(idx, 1)} disabled={idx === studio.phaseCount - 1} title="后移">↓</button>
        <button class="btn sm ghost" onclick={() => studio.duplicatePhase(idx)} title="复制阶段">复制</button>
        <button class="btn sm ghost danger" onclick={() => studio.removePhase(idx)} disabled={studio.phaseCount <= 1} title="删除阶段">删除</button>
      </div>
    </header>

    <label class="fl">
      <span>名称</span>
      <input type="text" value={ph.name}
             onchange={(e) => studio.setPhaseField(idx, 'name', e.currentTarget.value)}
             onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
    </label>

    <label class="fl">
      <span>类型</span>
      <select value={ph.kind} onchange={(e) => studio.setPhaseField(idx, 'kind', e.currentTarget.value)}>
        {#each PHASE_KINDS as k}<option value={k}>{k}</option>{/each}
      </select>
    </label>

    <label class="fl">
      <span>时长</span>
      <div class="dur">
        <input type="range" min="6" max="600" step="1" value={ph.durF}
               oninput={(e) => studio.setDuration(idx, +e.currentTarget.value)} />
        <input class="num mono" type="number" min="6" max="600" value={ph.durF}
               onchange={(e) => studio.setDuration(idx, +e.currentTarget.value)}
               onkeydown={(e) => {
                 if (e.key === 'Enter') { e.currentTarget.blur(); }
                 if (e.key === 'Escape') { e.currentTarget.value = String(ph.durF); e.currentTarget.blur(); }
               }} />
        <em class="mono">帧</em>
      </div>
    </label>
    <p class="note">
      改动时长只重排本阶段节奏，后续阶段整体平移 · 起点 {start} · 区间 {start}–{start + ph.durF - 1}
    </p>

    <label class="fl">
      <span>喷发柱</span>
      <div class="dur">
        <input type="range" min="0" max="1" step="0.01" value={ph.plume}
               oninput={(e) => studio.setPhaseField(idx, 'plume', +e.currentTarget.value)} />
        <span class="mono val">{Math.round(ph.plume * 100)}%</span>
      </div>
    </label>
    <label class="chk">
      <input type="checkbox" checked={ph.umbrella} onchange={(e) => studio.setPhaseField(idx, 'umbrella', e.currentTarget.checked)} />
      伞状云顶（普林尼式柱体顶部展开）
    </label>

    <label class="fl">
      <span>说明</span>
      <textarea rows="2" value={ph.note}
        onchange={(e) => studio.setPhaseField(idx, 'note', e.currentTarget.value)}
        placeholder="这一阶段的野外证据 / 讲解要点"></textarea>
    </label>
  </section>

  <!-- 锥体形态 -->
  <section class="blk">
    <header>
      <span class="tag amber">锥体形态</span>
      <span class="sub">{coneDef.name}</span>
      <button class="btn sm ghost" onclick={() => studio.addPhase(idx)} title="在之后插入阶段">＋阶段</button>
    </header>

    <div class="presets">
      {#each CONE_PRESETS as p}
        <button
          class="preset"
          class:on={ph.tracks.cone.presetId === p.id}
          draggable="true"
          ondragstart={(e) => {
            e.dataTransfer?.setData('application/x-cone-preset', p.id);
            if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
          }}
          onclick={() => studio.assignCone(idx, p.id)}
          title={`${p.name} · ${p.blurb}（可拖到时间轴的阶段条上）`}>
          <span class="pn">{p.name}</span>
          <span class="pc">{p.cat}</span>
        </button>
      {/each}
    </div>
    <p class="blurb">{coneDef.blurb}</p>

    <div class="inline">
      <label class="fl tight">
        <span>色调</span>
        <input type="range" min="0" max="1" step="0.01" value={ph.tracks.cone.tone}
               oninput={(e) => studio.setTrackField(idx, 'cone', { tone: +e.currentTarget.value })} />
      </label>
      <label class="chk">
        <input type="checkbox" checked={ph.tracks.cone.visible}
               onchange={(e) => studio.setTrackField(idx, 'cone', { visible: e.currentTarget.checked })} />
        显示
      </label>
    </div>

    <!-- 编组 -->
    <div class="groupbox">
      {#if group}
        <span class="gtag">已编组：{group.name}</span>
        <button class="btn sm ghost" onclick={() => studio.ungroup('cone')}>解组</button>
      {:else}
        <span class="gtag dim">与其它轨道编组后可一起拖动</span>
        <button class="btn sm" onclick={() => studio.group(['cone', 'tephra'], '锥体 + 碎屑层')}>锥体＋碎屑层 编组</button>
      {/if}
    </div>
  </section>

  <!-- 熔岩流 -->
  <section class="blk">
    <header>
      <span class="tag lava">熔岩流前缘</span>
      <span class="sub mono">{cur.lava?.front?.toFixed(2) ?? '0.00'}</span>
      <button class="btn sm" onclick={() => studio.addKey('lava')} title="在当前帧给前缘打点">打点</button>
    </header>

    <div class="inline">
      <label class="chk">
        <input type="checkbox" checked={ph.tracks.lava.visible}
               onchange={(e) => studio.setTrackField(idx, 'lava', { visible: e.currentTarget.checked })} />
        显示
      </label>
      <span class="hintline">1.00 = 前缘抵达锥缘；(>1 越过锥缘进入平地)</span>
    </div>

    <div class="kv">
      {#each keyRows[1].keys as k}
        <div class="krow" class:near={Math.abs(k.u - cur.u) < 0.02}>
          <button class="jump mono" onclick={() => gotoKey(k)}>{String(k.gf).padStart(3, '0')}f</button>
          <span class="mono sm2">前缘 {k.front?.toFixed(2)}</span>
          <span class="mono sm2">宽 {k.width?.toFixed(2)}</span>
          <button class="del" onclick={() => studio.removeKey('lava', k.id)} disabled={ph.tracks.lava.keys.length <= 1} aria-label="删除关键帧">×</button>
        </div>
      {/each}
    </div>
  </section>

  <!-- 碎屑层 -->
  <section class="blk">
    <header>
      <span class="tag ash">火山碎屑层</span>
      <span class="sub mono">{((cur.tephra?.thickness ?? 0) * 100).toFixed(0)}%</span>
    </header>
    <div class="inline">
      <label class="chk">
        <input type="checkbox" checked={ph.tracks.tephra.visible}
               onchange={(e) => studio.setTrackField(idx, 'tephra', { visible: e.currentTarget.checked })} />
        显示
      </label>
      {#each TEPHRA_PRESETS as t}
        <button class="btn sm ghost" class:on={ph.tracks.tephra.presetId === t.id}
                onclick={() => studio.assignTephra(idx, t.id)} title={t.blurb}>{t.name}</button>
      {/each}
    </div>
    <div class="kv">
      {#each keyRows[2].keys as k}
        <div class="krow" class:near={Math.abs(k.u - cur.u) < 0.02}>
          <button class="jump mono" onclick={() => gotoKey(k)}>{String(k.gf).padStart(3, '0')}f</button>
          <span class="mono sm2">厚 {k.thickness?.toFixed(2)}</span>
          <span class="mono sm2">覆 {k.cover?.toFixed(2)}</span>
          <button class="del" onclick={() => studio.removeKey('tephra', k.id)} disabled={ph.tracks.tephra.keys.length <= 1} aria-label="删除关键帧">×</button>
        </div>
      {/each}
    </div>
  </section>

  <!-- 一致性检查 -->
  <section class="blk">
    <header>
      <span class="tag">覆盖关系检查</span>
      <span class="sub mono">当前帧</span>
    </header>
    <div class="probe">
      <div class="probe-row">
        <span>前缘相对锥缘</span>
        <strong class:bad={curInspect.overrun > 1} class:ok={curInspect.overrun <= 1}>
          {curInspect.overrun > 1 ? `越过 ${Math.round(curInspect.overrun)} px` : '未越过'}
        </strong>
      </div>
      <div class="probe-row">
        <span>前缘位置</span>
        <strong class="mono">{curInspect.frontFrac.toFixed(2)}</strong>
      </div>
      {#if curInspect.issues.length}
        {#each curInspect.issues as it}
          <p class="iss" class:warn={it.severity === 'warn'}>{it.text}</p>
        {/each}
      {:else}
        <p class="iss ok">本帧无越界 / 悬空问题</p>
      {/if}
      {#if curInspect.overrun > 1}
        <button class="btn sm cmp" onclick={() => studio.stepBackCompare()}>退一格叠着看</button>
      {/if}
    </div>

    {#if scan.length}
      <details class="scan">
        <summary>本阶段 {scan.length} 处需要留意</summary>
        <div class="scan-list">
          {#each scan as s}
            <button class="scan-item" class:on={s.frame === studio.frame} onclick={() => studio.setFrame(s.frame)}>
              <span class="mono">{s.frame}f</span>
              <span>{s.issues.map((i) => i.text).join('；')}</span>
            </button>
          {/each}
        </div>
      </details>
    {:else}
      <p class="iss ok">整段阶段采样无越界 / 悬空</p>
    {/if}
  </section>
</aside>

<style>
  .insp {
    display: flex; flex-direction: column; gap: 1px; overflow-y: auto;
    background: var(--bg1); border-left: 1px solid var(--line); min-height: 0;
  }
  .blk { padding: 10px 12px 12px; border-bottom: 1px solid var(--line); display: flex; flex-direction: column; gap: 8px; }
  .blk header { display: flex; align-items: center; gap: 8px; }
  .tag { font-size: 11px; font-weight: 700; letter-spacing: .04em; color: var(--fg2); text-transform: uppercase; }
  .tag.amber { color: var(--amber); }
  .tag.lava { color: var(--lava); }
  .tag.ash { color: var(--ash); }
  .sub { font-size: 11px; color: var(--fg3); flex: 1; }
  .acts { margin-left: auto; display: flex; gap: 3px; }

  .fl { display: grid; grid-template-columns: 52px 1fr; align-items: center; gap: 8px; }
  .fl.tight { flex: 1; }
  .fl > span { font-size: 11px; color: var(--fg3); }
  .fl input[type="text"], .fl select, .fl textarea { width: 100%; }
  .dur { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .dur input[type="range"] { flex: 1; min-width: 0; }
  .dur .num { width: 56px; padding: 4px 6px; }
  .dur em { font-size: 11px; color: var(--fg3); font-style: normal; }
  .val { font-size: 11px; color: var(--fg2); width: 34px; text-align: right; }
  .note { margin: 0; font-size: 10.5px; line-height: 1.5; color: var(--fg3); }
  .chk { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--fg2); cursor: pointer; }

  .presets { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
  .preset {
    display: flex; flex-direction: column; gap: 2px; align-items: flex-start;
    padding: 6px 8px; border-radius: 6px; border: 1px solid var(--line2);
    background: var(--bg2); cursor: pointer; text-align: left;
  }
  .preset:hover { background: #202531; border-color: #414a5e; }
  .preset.on { border-color: var(--amber); background: #2b2119; }
  .preset .pn { font-size: 11.5px; color: var(--fg); }
  .preset .pc { font-size: 9.5px; color: var(--fg3); }
  .blurb { margin: 0; font-size: 11px; line-height: 1.55; color: var(--fg3); }
  .inline { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

  .groupbox { display: flex; align-items: center; gap: 8px; padding-top: 4px; border-top: 1px dashed var(--line2); }
  .gtag { font-size: 11px; color: var(--amber); }
  .gtag.dim { color: var(--fg3); flex: 1; }
  .btn.on { background: #2b2119; border-color: var(--amber); color: #ffd2a3; }

  .kv { display: flex; flex-direction: column; gap: 3px; }
  .krow {
    display: flex; align-items: center; gap: 8px; padding: 3px 6px; border-radius: 5px;
    background: var(--bg2); font-size: 11px;
  }
  .krow.near { background: #2a2318; outline: 1px solid #4a3c22; }
  .jump { border: 0; background: none; color: var(--accent); cursor: pointer; padding: 0; font-size: 11px; }
  .jump:hover { text-decoration: underline; }
  .sm2 { color: var(--fg2); }
  .del { margin-left: auto; border: 0; background: none; color: var(--fg3); cursor: pointer; font-size: 14px; line-height: 1; }
  .del:hover { color: var(--bad); }
  .del:disabled { opacity: .3; cursor: not-allowed; }
  .hintline { font-size: 10.5px; color: var(--fg3); }

  .probe { display: flex; flex-direction: column; gap: 6px; }
  .probe-row { display: flex; justify-content: space-between; font-size: 11.5px; color: var(--fg2); }
  .probe-row strong { font-weight: 600; }
  .probe-row .ok { color: var(--ok); }
  .probe-row .bad { color: var(--warn); }
  .iss { margin: 0; font-size: 11px; color: var(--fg3); }
  .iss.ok { color: #6f8f78; }
  .iss.warn { color: var(--warn); }
  .cmp { align-self: flex-start; background: #2c2319; border-color: #5a4526; color: #ffdc9a; }

  .scan summary { font-size: 11px; color: var(--fg3); cursor: pointer; }
  .scan-list { display: flex; flex-direction: column; gap: 2px; margin-top: 6px; max-height: 140px; overflow-y: auto; }
  .scan-item {
    display: flex; gap: 8px; align-items: baseline; text-align: left; font-size: 11px;
    background: var(--bg2); border: 1px solid transparent; border-radius: 5px; padding: 3px 6px; cursor: pointer; color: var(--fg2);
  }
  .scan-item:hover { border-color: var(--line2); }
  .scan-item.on { border-color: var(--accent); color: var(--fg); }
  .scan-item .mono { color: var(--accent); flex: none; }
</style>
